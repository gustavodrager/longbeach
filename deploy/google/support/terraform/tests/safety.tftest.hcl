mock_provider "google" {}
mock_provider "google-beta" {}

variables {
  environment = "production"
  project_ids = {
    production = "parsero-prod-20261022"
    staging    = "parsero-staging-20261022"
  }
  billing_account_id = "000000-000000-000000"
  pg_version         = "POSTGRES_18"
}

run "preserve_vm_dependencies_and_frozen_variable_compatibility" {
  command = plan
  variables {
    api_image                = "southamerica-east1-docker.pkg.dev/parsero-prod-20261022/longbeach/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    enable_api_service       = true
    managed_source_suspended = true
    managed_source_revision  = "longbeach-api-freeze-20261026t143544z-3d35c14d"
    create_web_custom_domain = true
    web_origin               = "https://longbeach.quebranunca.com.br"
    manage_billing_budget    = true
    extra_runtime_secrets = {
      Authentication__Google__AllowedEmail = { secret_suffix = "google-allowed-email", version = "1" }
      Integrations__PagBankEdi__User       = { secret_suffix = "pagbank-edi-user", version = "1" }
      Integrations__PagBankEdi__Token      = { secret_suffix = "pagbank-edi-token", version = "1" }
    }
  }
  assert {
    condition = (toset(keys(google_secret_manager_secret.longbeach)) == toset([
      "db-runtime-connection", "db-migration-connection", "jwt-signing-key",
      "google-allowed-email", "pagbank-edi-user", "pagbank-edi-token"
      ]) && alltrue([for key, secret in google_secret_manager_secret.longbeach :
      secret.secret_id == "longbeach-${key}" && secret.project == "parsero-prod-20261022" &&
      secret.replication[0].user_managed[0].replicas[0].location == "southamerica-east1"
    ]))
    error_message = "Keep all existing production secret containers and São Paulo replicas under unchanged addresses."
  }
  assert {
    condition = (google_secret_manager_secret.database_admin.secret_id == "parsero-postgres-admin-password" &&
      google_secret_manager_secret.database_admin.deletion_policy == "PREVENT" &&
      google_artifact_registry_repository.longbeach.repository_id == "longbeach" &&
      google_artifact_registry_repository.longbeach.docker_config[0].immutable_tags &&
    google_artifact_registry_repository.longbeach.location == "southamerica-east1")
    error_message = "Preserve recovery secret and immutable VM image repository."
  }
  assert {
    condition = (google_firebase_project.selected.project == "parsero-prod-20261022" &&
      google_firebase_hosting_site.longbeach.deletion_policy == "PREVENT" &&
      google_firebase_hosting_site.longbeach.site_id == "parsero-prod-20261022" &&
    google_firebase_hosting_custom_domain.web[0].custom_domain == "longbeach.quebranunca.com.br")
    error_message = "Retirement must retain the production frontend and current custom domain."
  }
  assert {
    condition = (google_billing_budget.parsero[0].amount[0].specified_amount[0].currency_code == "BRL" &&
      google_billing_budget.parsero[0].amount[0].specified_amount[0].units == "1500" &&
    alltrue([for service in google_project_service.required : !service.disable_on_destroy]))
    error_message = "Keep the alert budget and avoid disabling required project APIs during decommissioning."
  }
}

run "reject_staging" {
  command = plan
  variables { environment = "staging" }
  expect_failures = [terraform_data.deployment_guards]
}

run "reject_wrong_project" {
  command = plan
  variables { project_ids = { production = "another-prod-20261022", staging = "parsero-staging-20261022" } }
  expect_failures = [terraform_data.deployment_guards]
}

run "reject_source_workers" {
  command = plan
  variables { workers_enabled = true }
  expect_failures = [terraform_data.deployment_guards]
}

run "reject_public_source_api" {
  command = plan
  variables { public_api_enabled = true }
  expect_failures = [terraform_data.deployment_guards]
}

run "reject_lavamais" {
  command = plan
  variables { enable_lavamais_database = true }
  expect_failures = [terraform_data.deployment_guards]
}

run "reject_danielli" {
  command = plan
  variables { enable_danielli_database = true }
  expect_failures = [terraform_data.deployment_guards]
}
