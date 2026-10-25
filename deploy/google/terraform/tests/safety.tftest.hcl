mock_provider "google" {}
mock_provider "google-beta" {}

variables {
  environment = "production"
  project_ids = {
    production = "parsero-test-production"
    staging    = "parsero-test-staging"
  }
  billing_account_id = "000000-000000-000000"
  pg_version         = "POSTGRES_18"
}

run "production_data_protection_without_application" {
  command = plan
  assert {
    condition     = output.database_names == ["longbeach"]
    error_message = "Preserve both the value and tuple type of the existing production database_names output."
  }
  assert {
    condition = (google_sql_database_instance.shared.settings[0].availability_type == "REGIONAL" &&
    google_sql_database_instance.shared.settings[0].location_preference[0].zone != google_sql_database_instance.shared.settings[0].location_preference[0].secondary_zone)
    error_message = "Production must have a standby in another São Paulo zone."
  }
  assert {
    condition = (google_sql_database_instance.shared.settings[0].tier == "db-custom-1-4096" &&
    google_sql_database_instance.shared.settings[0].disk_size == 20 && google_sql_database_instance.shared.settings[0].disk_autoresize)
    error_message = "Keep the reviewed 1 CPU / 4 GiB / growing 20 GiB initial sizing."
  }
  assert {
    condition = (google_sql_database_instance.shared.settings[0].backup_configuration[0].enabled &&
      google_sql_database_instance.shared.settings[0].backup_configuration[0].point_in_time_recovery_enabled &&
      google_sql_database_instance.shared.settings[0].backup_configuration[0].transaction_log_retention_days == 7 &&
    google_sql_database_instance.shared.settings[0].backup_configuration[0].backup_retention_settings[0].retained_backups == 7)
    error_message = "Keep seven daily backups and seven-day PITR enabled."
  }
  assert {
    condition = (length(google_sql_database_instance.shared.settings[0].ip_configuration[0].authorized_networks) == 0 &&
      google_sql_database_instance.shared.settings[0].ip_configuration[0].ssl_mode == "ENCRYPTED_ONLY" &&
    google_sql_database_instance.shared.deletion_protection && google_sql_database_instance.shared.settings[0].deletion_protection_enabled)
    error_message = "Database must not accept arbitrary public networks or unencrypted transport, and must resist deletion."
  }
  assert {
    condition     = (length(google_cloud_run_v2_service.api) == 0 && length(google_cloud_run_v2_job.migration) == 0 && length(google_compute_global_forwarding_rule.api_https) == 0)
    error_message = "Initial infrastructure must not start application workers or expose a new API."
  }
  assert {
    condition = (length(google_sql_database.client) == 1 && contains(keys(google_sql_database.client), "longbeach") &&
    !contains(keys(google_secret_manager_secret_iam_member.runtime), "db-migration-connection"))
    error_message = "Default provisioning is LongBeach only and runtime cannot read migration credentials."
  }
}

run "staging_uses_separate_project" {
  command = plan
  variables { environment = "staging" }
  assert {
    condition     = (google_sql_database_instance.shared.project == "parsero-test-staging" && google_sql_database_instance.shared.settings[0].availability_type == "ZONAL")
    error_message = "Staging must use its own project and avoid a second production HA charge."
  }
}

run "migration_can_be_prepared_before_api" {
  command = plan
  variables {
    api_image = "southamerica-east1-docker.pkg.dev/parsero-test-production/longbeach/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
  assert {
    condition = (length(google_cloud_run_v2_service.api) == 0 && length(google_cloud_run_v2_job.migration) == 1 &&
      google_cloud_run_v2_job.migration[0].template[0].task_count == 1 &&
      google_cloud_run_v2_job.migration[0].template[0].parallelism == 1 &&
    google_cloud_run_v2_job.migration[0].template[0].template[0].max_retries == 0)
    error_message = "Prepare the controlled one-task migration before exposing the API."
  }
}

run "api_workers_stay_off_and_load_balancer_is_required" {
  command = plan
  variables {
    api_image          = "southamerica-east1-docker.pkg.dev/parsero-test-production/longbeach/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    enable_api_service = true
    api_domain         = "api.longbeach.example.com"
    web_origin         = "https://longbeach.example.com"
    csrf_cookie_domain = "longbeach.example.com"
    runtime_environment = {
      AllowedHosts                            = "api.longbeach.example.com"
      Authentication__Jwt__AccessTokenMinutes = "15"
      Authentication__Jwt__RefreshTokenDays   = "30"
    }
  }
  assert {
    condition = (google_cloud_run_v2_service.api[0].ingress == "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER" &&
      google_cloud_run_v2_service.api[0].template[0].scaling[0].min_instance_count == 1 &&
      google_cloud_run_v2_service.api[0].template[0].scaling[0].max_instance_count == 1 &&
    !google_cloud_run_v2_service.api[0].template[0].containers[0].resources[0].cpu_idle)
    error_message = "LongBeach must retain continuous CPU with a load-balancer-only ingress."
  }
  assert {
    condition     = (one([for setting in google_cloud_run_v2_service.api[0].template[0].containers[0].env : setting.value if setting.name == "BackgroundJobs__Enabled"]) == "false")
    error_message = "Starting the destination must not start duplicate financial workers."
  }
  assert {
    condition     = length(google_cloud_run_v2_service_iam_member.public_api) == 0
    error_message = "The candidate API must remain IAM-private while the load balancer and certificate are prepared."
  }
  assert {
    condition = (one([for header in google_cloud_run_v2_service.api[0].template[0].containers[0].startup_probe[0].http_get[0].http_headers : header.value if header.name == "Host"]) == var.api_domain &&
    one([for header in google_cloud_run_v2_service.api[0].template[0].containers[0].liveness_probe[0].http_get[0].http_headers : header.value if header.name == "Host"]) == var.api_domain)
    error_message = "Startup and liveness probes must preserve the API Host accepted by restricted AllowedHosts."
  }
  assert {
    condition = (one([for setting in google_cloud_run_v2_service.api[0].template[0].containers[0].env : setting.value if setting.name == "Authentication__Jwt__AccessTokenMinutes"]) == "15" &&
    one([for setting in google_cloud_run_v2_service.api[0].template[0].containers[0].env : setting.value if setting.name == "Authentication__Jwt__RefreshTokenDays"]) == "30")
    error_message = "Public JWT lifetimes must be preserved explicitly without weakening token credential protection."
  }
}

run "reject_duplicate_environment_projects" {
  command = plan
  variables {
    project_ids = { production = "parsero-test-production", staging = "parsero-test-production" }
  }
  expect_failures = [var.project_ids]
}

run "reject_unconfirmed_source_workers" {
  command = plan
  variables {
    api_image          = "southamerica-east1-docker.pkg.dev/parsero-test-production/longbeach/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    enable_api_service = true
    api_domain         = "api.longbeach.example.com"
    web_origin         = "https://longbeach.example.com"
    csrf_cookie_domain = "longbeach.example.com"
    workers_enabled    = true
  }
  expect_failures = [google_cloud_run_v2_service.api]
}

run "reject_secret_values_in_plain_settings" {
  command = plan
  variables { runtime_environment = { PagBank__Token = "must-use-secret-manager" } }
  expect_failures = [var.runtime_environment]
}

run "budget_uses_brl_and_three_warning_thresholds" {
  command = plan
  variables { manage_billing_budget = true }
  assert {
    condition = (google_billing_budget.parsero[0].amount[0].specified_amount[0].currency_code == "BRL" &&
      google_billing_budget.parsero[0].amount[0].specified_amount[0].units == "1500" &&
    toset([for threshold in google_billing_budget.parsero[0].threshold_rules : threshold.threshold_percent]) == toset([0.5, 0.8, 1.0]))
    error_message = "The account budget must retain the approved currency, amount and warning thresholds."
  }
  assert {
    condition     = length(google_billing_budget.parsero[0].all_updates_rule) == 0
    error_message = "Default IAM email recipients require no empty notifications rule that the API omits on read."
  }
}

run "custom_budget_channels_preserve_default_iam_email_recipients" {
  command = plan
  variables {
    manage_billing_budget        = true
    budget_notification_channels = ["projects/parsero-test-production/notificationChannels/12345"]
  }
  assert {
    condition = (length(google_billing_budget.parsero[0].all_updates_rule) == 1 &&
      !google_billing_budget.parsero[0].all_updates_rule[0].disable_default_iam_recipients &&
      toset(google_billing_budget.parsero[0].all_updates_rule[0].monitoring_notification_channels) ==
    toset(["projects/parsero-test-production/notificationChannels/12345"]))
    error_message = "Custom monitoring email channels must supplement rather than disable default IAM recipients."
  }
}

run "reject_mutable_image_tags" {
  command = plan
  variables {
    api_image = "southamerica-east1-docker.pkg.dev/parsero-test-production/longbeach/api:latest"
  }
  expect_failures = [var.api_image]
}

run "reject_public_api_before_cutover_gate" {
  command = plan
  variables {
    api_image          = "southamerica-east1-docker.pkg.dev/parsero-test-production/longbeach/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    enable_api_service = true
    api_domain         = "api.longbeach.example.com"
    web_origin         = "https://longbeach.example.com"
    csrf_cookie_domain = "longbeach.example.com"
    public_api_enabled = true
  }
  expect_failures = [terraform_data.deployment_guards]
}

run "public_api_requires_explicit_gate_independent_of_workers" {
  command = plan
  variables {
    api_image              = "southamerica-east1-docker.pkg.dev/parsero-test-production/longbeach/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    enable_api_service     = true
    api_domain             = "api.longbeach.example.com"
    web_origin             = "https://longbeach.example.com"
    csrf_cookie_domain     = "longbeach.example.com"
    public_api_enabled     = true
    cutover_gate_confirmed = true
  }
  assert {
    condition     = length(google_cloud_run_v2_service_iam_member.public_api) == 1 && google_cloud_run_v2_service_iam_member.public_api[0].member == "allUsers"
    error_message = "Only the explicit cutover gate may enable public invocation; workers remain separately controlled."
  }
}

run "reject_lowercase_safety_setting" {
  command = plan
  variables { runtime_environment = { backgroundjobs__enabled = "true" } }
  expect_failures = [var.runtime_environment]
}

run "reject_mixed_case_safety_secret" {
  command = plan
  variables {
    extra_runtime_secrets = { bAcKgRoUnDjObS__EnAbLeD = { secret_suffix = "override-workers", version = "1" } }
  }
  expect_failures = [var.extra_runtime_secrets]
}

run "reject_lowercase_core_connection_secret" {
  command = plan
  variables {
    extra_runtime_secrets = { connectionstrings__longbeach = { secret_suffix = "override-database", version = "1" } }
  }
  expect_failures = [var.extra_runtime_secrets]
}

run "reject_colon_in_plain_environment_name" {
  command = plan
  variables { runtime_environment = { "Payments:Environment" = "Sandbox" } }
  expect_failures = [var.runtime_environment]
}

run "reject_plain_names_differing_only_in_case" {
  command = plan
  variables { runtime_environment = { Payments__Environment = "Sandbox", payments__environment = "Production" } }
  expect_failures = [var.runtime_environment]
}

run "reject_secret_names_differing_only_in_case" {
  command = plan
  variables {
    extra_runtime_secrets = {
      Payments__Credential = { secret_suffix = "payments-key-one", version = "1" }
      payments__credential = { secret_suffix = "payments-key-two", version = "1" }
    }
  }
  expect_failures = [var.extra_runtime_secrets]
}

run "reject_case_insensitive_plain_and_secret_collision" {
  command = plan
  variables {
    api_image             = "southamerica-east1-docker.pkg.dev/parsero-test-production/longbeach/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    enable_api_service    = true
    api_domain            = "api.longbeach.example.com"
    web_origin            = "https://longbeach.example.com"
    csrf_cookie_domain    = "longbeach.example.com"
    runtime_environment   = { Payments__Environment = "Sandbox" }
    extra_runtime_secrets = { payments__environment = { secret_suffix = "payments-environment", version = "1" } }
  }
  expect_failures = [google_cloud_run_v2_service.api]
}

run "administrative_database_secret_is_not_accessible_to_application_identities" {
  command = plan
  assert {
    condition = (google_secret_manager_secret.database_admin.secret_id == "parsero-postgres-admin-password" &&
      google_secret_manager_secret.database_admin.project == "parsero-test-production" &&
      google_secret_manager_secret.database_admin.replication[0].user_managed[0].replicas[0].location == "southamerica-east1" &&
    google_secret_manager_secret.database_admin.deletion_policy == "PREVENT")
    error_message = "Keep the administrative recovery secret isolated in São Paulo and protected against deletion."
  }
  assert {
    condition = (alltrue([for binding in values(google_secret_manager_secret_iam_member.runtime) : binding.secret_id != google_secret_manager_secret.database_admin.secret_id]) &&
    alltrue([for binding in values(google_secret_manager_secret_iam_member.migration) : binding.secret_id != google_secret_manager_secret.database_admin.secret_id]))
    error_message = "Runtime and migration identities must never receive access to the administrative database password."
  }
}

run "accept_case_insensitive_public_jwt_lifetime_names" {
  command = plan
  variables {
    runtime_environment = {
      AUTHENTICATION__JWT__ACCESSTOKENMINUTES = "5"
      authentication__jwt__refreshtokendays   = "90"
    }
  }
  assert {
    condition     = var.runtime_environment["AUTHENTICATION__JWT__ACCESSTOKENMINUTES"] == "5" && var.runtime_environment["authentication__jwt__refreshtokendays"] == "90"
    error_message = "Nominal lifetime names follow .NET case-insensitive semantics and accept the documented bounds."
  }
}

run "reject_non_integer_public_jwt_lifetime" {
  command = plan
  variables { runtime_environment = { Authentication__Jwt__AccessTokenMinutes = "15.5" } }
  expect_failures = [var.runtime_environment]
}

run "reject_non_numeric_public_jwt_lifetime" {
  command = plan
  variables { runtime_environment = { Authentication__Jwt__RefreshTokenDays = "must-not-be-a-secret-value" } }
  expect_failures = [var.runtime_environment]
}

run "reject_access_token_lifetime_below_application_minimum" {
  command = plan
  variables { runtime_environment = { Authentication__Jwt__AccessTokenMinutes = "4" } }
  expect_failures = [var.runtime_environment]
}

run "reject_access_token_lifetime_above_application_maximum" {
  command = plan
  variables { runtime_environment = { Authentication__Jwt__AccessTokenMinutes = "121" } }
  expect_failures = [var.runtime_environment]
}

run "reject_non_positive_refresh_token_lifetime" {
  command = plan
  variables { runtime_environment = { Authentication__Jwt__RefreshTokenDays = "0" } }
  expect_failures = [var.runtime_environment]
}

run "reject_refresh_token_lifetime_above_application_maximum" {
  command = plan
  variables { runtime_environment = { Authentication__Jwt__RefreshTokenDays = "91" } }
  expect_failures = [var.runtime_environment]
}

run "reject_token_credentials_resembling_public_lifetime_names" {
  command = plan
  variables { runtime_environment = { Authentication__Jwt__AccessToken = "must-use-secret-manager" } }
  expect_failures = [var.runtime_environment]
}
