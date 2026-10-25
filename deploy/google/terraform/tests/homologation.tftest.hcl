mock_provider "google" {}
mock_provider "google-beta" {}

variables {
  environment = "staging"
  project_ids = {
    production = "parsero-prod-20261022"
    staging    = "parsero-staging-20261022"
  }
  billing_account_id             = "000000-000000-000000"
  pg_version                     = "POSTGRES_18"
  enable_pagbank_homolog         = true
  homologation_credentials_ready = true
  api_domain                     = "api.longbeach-homolog.quebranunca.com.br"
  web_origin                     = "https://longbeach-homolog.quebranunca.com.br"
  csrf_cookie_domain             = "longbeach-homolog.quebranunca.com.br"
  api_image                      = "southamerica-east1-docker.pkg.dev/parsero-staging-20261022/longbeach/api@sha256:9c18b3d5029da31368ddac916ca9507b5a6639bc990a84b28e7faa88e4cdc17d"
}

run "preserves_old_staging_database_and_creates_only_exclusive_homologation_database" {
  command = plan
  assert {
    condition = (length(google_sql_database.client) == 1 && google_sql_database.client["longbeach"].name == "longbeach" &&
      google_sql_database.pagbank_homolog[0].name == "longbeach_pagbank_homolog" &&
    google_sql_database.pagbank_homolog[0].project == "parsero-staging-20261022")
    error_message = "Preserve the old staging database and add only the exclusive homologation database."
  }
  assert {
    condition = (alltrue([for suffix in ["db-runtime-connection", "db-migration-connection", "jwt-signing-key"] : contains(keys(google_secret_manager_secret.longbeach), suffix)]) &&
    contains(keys(google_secret_manager_secret.longbeach), "homologation-jwt-signing-key"))
    error_message = "Preserve old secrets and create a distinct new homologation JWT container."
  }
  assert {
    condition = (!contains(keys(google_secret_manager_secret_iam_member.runtime), "db-runtime-connection") &&
      !contains(keys(google_secret_manager_secret_iam_member.runtime), "homologation-db-migration-connection") &&
    !contains(keys(google_secret_manager_secret_iam_member.runtime), "homologation-reviewer-password"))
    error_message = "The API cannot access old staging credentials, migration credentials or the reviewer password."
  }
}

run "foundation_keeps_current_job_credentials_and_environment_unchanged" {
  command = plan
  variables {
    homologation_credentials_ready = false
    api_domain                     = ""
    web_origin                     = ""
    csrf_cookie_domain             = ""
  }
  assert {
    condition = (local.migration_secrets.ConnectionStrings__LongBeach.secret_suffix == "db-migration-connection" &&
      local.migration_secrets.Authentication__Jwt__SigningKey.secret_suffix == "jwt-signing-key" &&
      !contains(keys(local.migration_environment), "Homologation__Enabled") &&
      local.migration_environment.Cors__AllowedOrigins__0 == "" &&
      local.migration_environment.Authentication__CookieDomain == "" &&
      contains(keys(google_secret_manager_secret.longbeach), "homologation-reviewer-password") &&
    google_sql_database.pagbank_homolog[0].name == "longbeach_pagbank_homolog")
    error_message = "Foundation must add the database/secret containers without switching the existing staging job."
  }
}

run "reject_api_before_exclusive_credentials_exist" {
  command = plan
  variables {
    homologation_credentials_ready = false
    enable_api_service             = true
  }
  expect_failures = [terraform_data.homologation_guards]
}

run "endpoints_allow_dns_and_tls_without_credentials_consumers_or_job_changes" {
  command = plan
  variables {
    homologation_credentials_ready = false
    enable_homologation_endpoints  = true
    create_web_custom_domain       = true
  }
  assert {
    condition = (length(google_compute_global_address.api) == 1 &&
      length(google_certificate_manager_dns_authorization.api) == 1 &&
      length(google_certificate_manager_certificate.api) == 1 &&
      length(google_firebase_hosting_custom_domain.web) == 1 &&
      length(google_cloud_run_v2_service.api) == 0 &&
      length(google_compute_region_network_endpoint_group.api) == 0 &&
      length(google_compute_backend_service.api) == 0 &&
      length(google_compute_global_forwarding_rule.api_https) == 0 &&
      length(google_cloud_run_v2_service_iam_member.public_api) == 0 &&
      local.migration_environment.Cors__AllowedOrigins__0 == "" &&
      local.migration_environment.Authentication__CookieDomain == "" &&
    local.migration_secrets.ConnectionStrings__LongBeach.secret_suffix == "db-migration-connection")
    error_message = "Early endpoints may prepare DNS/TLS only, with no API, backend, public invocation or job configuration change."
  }
}

run "isolated_homologation_scales_to_zero_without_background_cpu" {
  command = plan
  variables { enable_api_service = true }
  assert {
    condition = (google_cloud_run_v2_service.api[0].template[0].scaling[0].min_instance_count == 0 &&
    google_cloud_run_v2_service.api[0].template[0].containers[0].resources[0].cpu_idle == true)
    error_message = "Homologation has no workers and must avoid paying for an always-on API instance."
  }
}

run "reject_early_endpoints_in_production" {
  command = plan
  variables {
    environment                    = "production"
    enable_pagbank_homolog         = false
    homologation_credentials_ready = false
    enable_homologation_endpoints  = true
    api_image                      = "southamerica-east1-docker.pkg.dev/parsero-prod-20261022/longbeach/api@sha256:9c18b3d5029da31368ddac916ca9507b5a6639bc990a84b28e7faa88e4cdc17d"
  }
  expect_failures = [var.enable_homologation_endpoints]
}

run "fictitious_password_login_requires_no_google_or_payment_provider" {
  command = plan
  variables { enable_api_service = true }
  assert {
    condition = (local.api_environment.Homologation__Enabled == "true" &&
      local.api_environment.BackgroundJobs__Enabled == "false" &&
      local.api_environment.Authentication__Google__Enabled == "false" &&
      local.api_environment.Integrations__PagBankEdi__Enabled == "false" &&
      local.api_environment.Integrations__C6__Enabled == "false" &&
      local.api_environment.Payments__Billing__Enabled == "false" &&
      local.api_environment.Payments__PagBank__Enabled == "false" &&
      local.api_environment.Payments__PagBankSubscriptions__Enabled == "false" &&
    local.api_environment.Payments__PagBank__BaseUrl == "https://sandbox.api.pagseguro.com/")
    error_message = "Keep fictitious authentication isolated and every external financial channel disabled."
  }
  assert {
    condition = (local.runtime_secrets.Authentication__Jwt__SigningKey.secret_suffix == "homologation-jwt-signing-key" &&
      local.runtime_secrets.ConnectionStrings__LongBeach.secret_suffix == "homologation-db-runtime-connection" &&
    local.migration_secrets.ConnectionStrings__LongBeach.secret_suffix == "homologation-db-migration-connection")
    error_message = "All consumers must use the new exclusive homologation identities and secrets."
  }
  assert {
    condition = (length(google_cloud_run_v2_service_iam_member.public_api) == 0 &&
    local.api_environment.Authentication__CookieDomain == "longbeach-homolog.quebranunca.com.br")
    error_message = "Keep candidates IAM private and isolate the CSRF cookie from production."
  }
}

run "preparation_uses_its_own_identity_and_password_secret_only_once" {
  command = plan
  variables { enable_homologation_prepare_job = true }
  assert {
    condition = (google_cloud_run_v2_job.homologation_prepare[0].template[0].task_count == 1 &&
      google_cloud_run_v2_job.homologation_prepare[0].template[0].parallelism == 1 &&
      google_cloud_run_v2_job.homologation_prepare[0].template[0].template[0].max_retries == 0 &&
    google_cloud_run_v2_job.homologation_prepare[0].template[0].template[0].containers[0].args == tolist(["LongBeach.Api.dll", "--prepare-pagbank-homologation"]))
    error_message = "Preparation is a separate one-task command with retries disabled."
  }
  assert {
    condition = (contains(keys(google_secret_manager_secret_iam_member.homologation_prepare), "homologation-reviewer-password") &&
      !contains(keys(google_secret_manager_secret_iam_member.homologation_prepare), "homologation-db-migration-connection") &&
    !contains(keys(google_secret_manager_secret_iam_member.migration), "homologation-reviewer-password"))
    error_message = "Only the preparation identity may access the reviewer password and it must not receive DDL credentials."
  }
}

run "reject_production_homologation" {
  command = plan
  variables {
    environment = "production"
    api_image   = "southamerica-east1-docker.pkg.dev/parsero-prod-20261022/longbeach/api@sha256:9c18b3d5029da31368ddac916ca9507b5a6639bc990a84b28e7faa88e4cdc17d"
  }
  expect_failures = [var.enable_pagbank_homolog]
}

run "reject_worker_activation" {
  command = plan
  variables { workers_enabled = true }
  expect_failures = [terraform_data.homologation_guards]
}

run "reject_external_secret_injection" {
  command = plan
  variables {
    extra_runtime_secrets = { Payments__PagBank__Token = { secret_suffix = "provider-token", version = "1" } }
  }
  expect_failures = [terraform_data.homologation_guards]
}

run "reject_case_insensitive_financial_flag_override" {
  command = plan
  variables { runtime_environment = { payments__pagbank__enabled = "true" } }
  expect_failures = [terraform_data.homologation_guards]
}

run "reject_extra_lowercase_cors_origin" {
  command = plan
  variables { runtime_environment = { cors__allowedorigins__1 = "https://unexpected.invalid" } }
  expect_failures = [terraform_data.homologation_guards]
}

run "reject_extra_mixed_case_cors_origin" {
  command = plan
  variables { runtime_environment = { cOrS__AlLoWeDoRiGiNs__1 = "https://unexpected.invalid" } }
  expect_failures = [terraform_data.homologation_guards]
}

run "reject_public_access_before_private_validation" {
  command = plan
  variables {
    enable_api_service     = true
    public_api_enabled     = true
    cutover_gate_confirmed = true
  }
  expect_failures = [terraform_data.homologation_guards]
}

run "reject_shared_production_cookie_domain" {
  command = plan
  variables { csrf_cookie_domain = "longbeach.quebranunca.com.br" }
  expect_failures = [terraform_data.homologation_guards]
}
