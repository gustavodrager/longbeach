# Reuse the already-authorized Parsero administrator. No public SSH or project-wide operator grants.
resource "google_project_service" "iap" {
  project            = var.project_id
  service            = "iap.googleapis.com"
  disable_on_destroy = false
}

resource "google_iap_tunnel_instance_iam_member" "operator" {
  project    = var.project_id
  zone       = local.zone
  instance   = google_compute_instance.vm.name
  role       = "roles/iap.tunnelResourceAccessor"
  member     = "user:parserotech@gmail.com"
  depends_on = [google_project_service.iap]
}

resource "google_compute_instance_iam_member" "operator_os_login" {
  project       = var.project_id
  zone          = local.zone
  instance_name = google_compute_instance.vm.name
  role          = "roles/compute.osAdminLogin"
  member        = "user:parserotech@gmail.com"
}

resource "google_service_account_iam_member" "operator_vm_identity" {
  service_account_id = google_service_account.vm.name
  role               = "roles/iam.serviceAccountUser"
  member             = "user:parserotech@gmail.com"
}
