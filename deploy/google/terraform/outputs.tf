output "project_id" { value = local.project_id }
output "app_project_id" { value = local.project_id }
output "data_project_id" { value = local.project_id }
output "region" { value = local.region }
output "api_service_name" { value = try(google_cloud_run_v2_service.api[0].name, null) }
output "api_service_uri" {
  description = "Cloud Run identity-token audience for private candidate validation; external direct ingress remains blocked."
  value       = try(google_cloud_run_v2_service.api[0].uri, null)
}
output "migration_job_name" { value = try(google_cloud_run_v2_job.migration[0].name, null) }
output "database_instance_name" { value = google_sql_database_instance.shared.name }
output "database_instance_connection_name" { value = google_sql_database_instance.shared.connection_name }
output "database_name" { value = google_sql_database.client["longbeach"].name }
output "database_names" { value = sort(concat(keys(google_sql_database.client), google_sql_database.pagbank_homolog[*].name)) }
output "runtime_service_account_email" { value = google_service_account.runtime.email }
output "migration_service_account_email" { value = google_service_account.migration.email }
output "firebase_site_id" { value = google_firebase_hosting_site.longbeach.site_id }
output "firebase_url" { value = "https://${local.site_id}.web.app" }
output "api_url" { value = local.app_ready ? "https://${var.api_domain}" : null }
output "api_ip_address" { value = try(google_compute_global_address.api[0].address, null) }
output "api_certificate_dns_authorization" {
  description = "Add this certificate authorization record to DNS before switching the existing API A record."
  value       = try(google_certificate_manager_dns_authorization.api[0].dns_resource_record[0], null)
}
output "web_required_dns_updates" {
  value = try(google_firebase_hosting_custom_domain.web[0].required_dns_updates, null)
}
output "secret_ids" {
  value = { for key, secret in google_secret_manager_secret.longbeach : key => secret.secret_id }
}
output "artifact_registry_repository" {
  value = "${local.region}-docker.pkg.dev/${local.project_id}/${google_artifact_registry_repository.longbeach.repository_id}"
}
output "budget_name" { value = try(google_billing_budget.parsero[0].name, null) }
