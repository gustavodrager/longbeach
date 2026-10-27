mock_provider "google" {}
mock_provider "google-beta" {}

variables {
  environment             = "production"
  project_ids             = { production = "parsero-test-production", staging = "parsero-test-staging" }
  billing_account_id      = "000000-000000-000000"
  pg_version              = "POSTGRES_18"
  api_image               = "southamerica-east1-docker.pkg.dev/parsero-test-production/longbeach/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  enable_api_service      = true
  api_domain              = "api.longbeach.example.com"
  web_origin              = "https://longbeach.example.com"
  csrf_cookie_domain      = "longbeach.example.com"
  public_api_enabled      = true
  cutover_gate_confirmed  = true
  managed_source_revision = "longbeach-api-freeze-20261026t143544z-3d35c14d"
}

run "default_keeps_running_sql_and_both_forwarding_rules" {
  command = plan
  variables { managed_source_revision = "" }
  assert {
    condition = (!var.managed_source_suspended &&
      google_cloud_run_v2_service.api[0].template[0].revision == null &&
      google_sql_database_instance.shared.settings[0].activation_policy == "ALWAYS" &&
      length(google_compute_global_forwarding_rule.api_http) == 1 &&
    length(google_compute_global_forwarding_rule.api_https) == 1)
    error_message = "The default must preserve production SQL compute and both existing forwarding rules."
  }
}

run "suspension_preserves_every_other_application_and_lb_resource" {
  command = plan
  variables { managed_source_suspended = true }
  assert {
    condition = (google_sql_database_instance.shared.settings[0].activation_policy == "NEVER" &&
      length(google_compute_global_forwarding_rule.api_http) == 0 &&
    length(google_compute_global_forwarding_rule.api_https) == 0)
    error_message = "The opt-in must stop SQL compute and remove exactly the HTTP/HTTPS forwarding rule instances."
  }
  assert {
    condition = (length(google_cloud_run_v2_service.api) == 1 &&
      length(google_cloud_run_v2_job.migration) == 1 &&
      length(google_cloud_run_v2_service_iam_member.public_api) == 1 &&
      google_cloud_run_v2_service.api[0].deletion_protection &&
      google_cloud_run_v2_job.migration[0].deletion_protection &&
      google_cloud_run_v2_service.api[0].template[0].containers[0].image == var.api_image &&
      google_cloud_run_v2_service.api[0].template[0].revision == var.managed_source_revision &&
      google_cloud_run_v2_service.api[0].template[0].scaling[0].min_instance_count == 0 &&
      google_cloud_run_v2_service.api[0].template[0].containers[0].resources[0].cpu_idle &&
    one([for setting in google_cloud_run_v2_service.api[0].template[0].containers[0].env : setting.value if setting.name == "BackgroundJobs__Enabled"]) == "false")
    error_message = "Suspension must retain the service, migration job, IAM and image, with the source already paused at min0, throttled CPU and workers off."
  }
  assert {
    condition = (length(google_compute_global_address.api) == 1 &&
      length(google_compute_region_network_endpoint_group.api) == 1 &&
      length(google_compute_backend_service.api) == 1 &&
      length(google_compute_url_map.api) == 1 &&
      length(google_compute_url_map.http_redirect) == 1 &&
      length(google_compute_target_https_proxy.api) == 1 &&
      length(google_compute_target_http_proxy.redirect) == 1 &&
      length(google_compute_ssl_policy.api) == 1 &&
      length(google_certificate_manager_dns_authorization.api) == 1 &&
      length(google_certificate_manager_certificate.api) == 1 &&
      length(google_certificate_manager_certificate_map.api) == 1 &&
    length(google_certificate_manager_certificate_map_entry.api) == 1)
    error_message = "Keep the reserved IP, NEG, backend, URL maps, proxies, TLS policy and certificate resources for recovery."
  }
  assert {
    condition = (google_sql_database_instance.shared.settings[0].availability_type == "REGIONAL" &&
      google_sql_database_instance.shared.settings[0].location_preference[0].zone == "southamerica-east1-a" &&
      google_sql_database_instance.shared.settings[0].location_preference[0].secondary_zone == "southamerica-east1-b" &&
      google_sql_database_instance.shared.settings[0].tier == "db-custom-1-4096" &&
      google_sql_database_instance.shared.settings[0].disk_type == "PD_SSD" &&
      google_sql_database_instance.shared.settings[0].disk_size == 20 &&
      google_sql_database_instance.shared.settings[0].disk_autoresize &&
      google_sql_database_instance.shared.deletion_protection &&
      google_sql_database_instance.shared.settings[0].deletion_protection_enabled &&
      google_sql_database_instance.shared.settings[0].backup_configuration[0].enabled &&
      google_sql_database_instance.shared.settings[0].backup_configuration[0].point_in_time_recovery_enabled &&
      google_sql_database_instance.shared.settings[0].backup_configuration[0].transaction_log_retention_days == 7 &&
      google_sql_database_instance.shared.settings[0].backup_configuration[0].backup_retention_settings[0].retained_backups == 7 &&
    length(google_sql_database.client) == 1 && google_sql_database.client["longbeach"].name == "longbeach")
    error_message = "Suspension must retain the existing LongBeach database, HA, storage, backup/PITR and deletion protections."
  }
}

run "reject_suspension_without_paused_revision" {
  command = plan
  variables {
    managed_source_suspended = true
    managed_source_revision  = ""
  }
  expect_failures = [var.managed_source_suspended]
}

run "reject_suspension_with_nonfreeze_revision" {
  command = plan
  variables {
    managed_source_suspended = true
    managed_source_revision  = "longbeach-api-00006-b4k"
  }
  expect_failures = [var.managed_source_suspended]
}

run "inactive_suspension_does_not_pin_a_revision" {
  command = plan
  variables { managed_source_revision = "unused-value" }
  assert {
    condition     = google_cloud_run_v2_service.api[0].template[0].revision == null
    error_message = "Without the opt-in, the revision input must not change the original automatic revision behavior."
  }
}

run "targeted_sql_cannot_skip_paused_revision_guard" {
  command = plan
  plan_options { target = [google_sql_database_instance.shared] }
  variables {
    managed_source_suspended = true
    managed_source_revision  = ""
  }
  expect_failures = [var.managed_source_suspended]
}

run "explicit_resume_restores_only_the_original_desired_presence" {
  command = plan
  variables { managed_source_suspended = false }
  assert {
    condition = (google_sql_database_instance.shared.settings[0].activation_policy == "ALWAYS" &&
      length(google_compute_global_forwarding_rule.api_http) == 1 &&
      length(google_compute_global_forwarding_rule.api_https) == 1 &&
      length(google_compute_global_address.api) == 1 &&
    length(google_cloud_run_v2_service.api) == 1)
    error_message = "Disabling the opt-in must restore the original infrastructure configuration without deleting retained resources."
  }
}

run "reject_managed_source_suspension_in_staging" {
  command = plan
  variables {
    environment              = "staging"
    api_image                = "southamerica-east1-docker.pkg.dev/parsero-test-staging/longbeach/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    managed_source_suspended = true
  }
  expect_failures = [var.managed_source_suspended]
}

run "reject_managed_source_suspension_with_source_workers" {
  command = plan
  variables {
    managed_source_suspended          = true
    workers_enabled                   = true
    source_workers_disabled_confirmed = true
  }
  expect_failures = [var.managed_source_suspended]
}

run "reject_managed_source_suspension_with_lavamais" {
  command = plan
  variables {
    managed_source_suspended = true
    enable_lavamais_database = true
  }
  expect_failures = [var.managed_source_suspended]
}

run "reject_managed_source_suspension_with_danielli" {
  command = plan
  variables {
    managed_source_suspended = true
    enable_danielli_database = true
  }
  expect_failures = [var.managed_source_suspended]
}

run "targeted_sql_cannot_skip_suspension_worker_guard" {
  command = plan
  plan_options { target = [google_sql_database_instance.shared] }
  variables {
    managed_source_suspended          = true
    workers_enabled                   = true
    source_workers_disabled_confirmed = true
  }
  expect_failures = [var.managed_source_suspended]
}

run "targeted_forwarding_rules_cannot_skip_other_client_guard" {
  command = plan
  plan_options { target = [google_compute_global_forwarding_rule.api_http, google_compute_global_forwarding_rule.api_https] }
  variables {
    managed_source_suspended = true
    enable_danielli_database = true
  }
  expect_failures = [var.managed_source_suspended]
}
