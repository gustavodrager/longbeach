mock_provider "google" {}
mock_provider "google-beta" {}

variables {
  environment = "staging"
  project_ids = {
    production = "parsero-prod-20261022"
    staging    = "parsero-staging-20261022"
  }
  billing_account_id = "000000-000000-000000"
  pg_version         = "POSTGRES_18"
}

run "retain_disabled_default_site_and_project_apis_only" {
  command = plan
  assert {
    condition = (google_firebase_project.selected.project == "parsero-staging-20261022" &&
      google_firebase_hosting_site.longbeach.site_id == "parsero-staging-20261022" &&
      google_firebase_hosting_site.longbeach.deletion_policy == "PREVENT" &&
    alltrue([for service in google_project_service.required : service.project == "parsero-staging-20261022" && !service.disable_on_destroy]))
    error_message = "Keep the disabled default site metadata and required APIs in the staging project."
  }
}

run "reject_production" {
  command = plan
  variables { environment = "production" }
  expect_failures = [terraform_data.deployment_guards]
}

run "reject_wrong_project" {
  command = plan
  variables { project_ids = { production = "parsero-prod-20261022", staging = "another-staging-20261022" } }
  expect_failures = [terraform_data.deployment_guards]
}

run "reject_other_site" {
  command = plan
  variables { firebase_site_id = "another-retired-site" }
  expect_failures = [terraform_data.deployment_guards]
}

run "reject_api" {
  command = plan
  variables { enable_api_service = true }
  expect_failures = [terraform_data.deployment_guards]
}

run "reject_public_api" {
  command = plan
  variables { public_api_enabled = true }
  expect_failures = [terraform_data.deployment_guards]
}

run "reject_workers" {
  command = plan
  variables { workers_enabled = true }
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

run "reject_budget" {
  command = plan
  variables { manage_billing_budget = true }
  expect_failures = [terraform_data.deployment_guards]
}

run "reject_custom_domain" {
  command = plan
  variables { create_web_custom_domain = true }
  expect_failures = [terraform_data.deployment_guards]
}
