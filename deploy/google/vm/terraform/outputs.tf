output "project_id" { value = var.project_id }
output "region" { value = local.region }
output "zone" { value = local.zone }
output "vm_name" { value = google_compute_instance.vm.name }
output "vm_service_account_email" { value = google_service_account.vm.email }
output "vm_external_ipv4" { value = google_compute_address.vm.address }
output "data_disk_name" { value = google_compute_disk.data.name }
output "data_disk_device_name" { value = "longbeach-postgres" }
output "backup_bucket_name" { value = google_storage_bucket.backup.name }
output "backup_prefix" { value = var.backup_prefix }
output "postgres_admin_secret_id" { value = google_secret_manager_secret.postgres_admin.secret_id }
output "public_ingress_enabled" { value = var.public_ingress_enabled }
output "bootstrap_manifest_sha256" { value = sha256(jsonencode(local.manifest)) }
output "iap_ssh_command" {
  value = "gcloud compute ssh ${google_compute_instance.vm.name} --project=${var.project_id} --zone=${local.zone} --tunnel-through-iap"
}
