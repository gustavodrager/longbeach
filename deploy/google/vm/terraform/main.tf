locals {
  region = "southamerica-east1"
  zone   = "southamerica-east1-a"
  labels = { application = "longbeach", environment = "production", deployment = "economy-vm" }
  manifest = {
    schema_version        = 1
    project_id            = var.project_id
    api_image             = var.api_image
    postgres_backup_image = var.postgres_backup_image
    caddy_image           = var.caddy_image
    api_domain            = "api.longbeach.quebranunca.com.br"
    web_origin            = "https://longbeach.quebranunca.com.br"
    secret_refs           = var.secret_refs
    postgres_admin_secret = {
      secret_id = "longbeach-vm-postgres-admin-password"
      version   = var.postgres_admin_secret_version
    }
    data = {
      device     = "/dev/disk/by-id/google-longbeach-postgres"
      mount_path = "/var/lib/longbeach"
    }
    backup = { bucket = var.backup_bucket_name, prefix = var.backup_prefix }
    public_environment = merge(var.public_environment, {
      ASPNETCORE_ENVIRONMENT                                 = "Production"
      ASPNETCORE_URLS                                        = "http://+:8080"
      Database__MigrateOnStartup                             = "false"
      Authorization__SeedOnStartup                           = "false"
      Bootstrap__InitialOwner__Enabled                       = "false"
      Authentication__Google__ProvisionAllowedEmailsAsOwners = "false"
      BackgroundJobs__Enabled                                = "false"
      Cors__AllowedOrigins__0                                = "https://longbeach.quebranunca.com.br"
      Authentication__CookieDomain                           = "longbeach.quebranunca.com.br"
      ReverseProxy__TrustAllForwarders                       = "false"
    })
    # The bundle must prepare only; restore, migrations, consumers and workers are explicit later steps.
    gates = { database_restore_approved = false, runtime_enabled = false, workers_enabled = false }
  }
}

resource "terraform_data" "deployment_guards" {
  lifecycle {
    precondition {
      condition     = !var.public_ingress_enabled || (var.public_ingress_approved && length(var.public_source_ranges) > 0)
      error_message = "HTTP/HTTPS ingress needs an approved test/cutover and explicit source ranges."
    }
    precondition {
      condition     = var.public_ingress_enabled || length(var.public_source_ranges) == 0
      error_message = "Keep source ranges empty while public ingress is disabled, so the initial plan is unambiguous."
    }
  }
}

resource "google_service_account" "vm" {
  project      = var.project_id
  account_id   = "longbeach-economy-vm"
  display_name = "LongBeach isolated VM runtime and backup"
}

resource "google_artifact_registry_repository_iam_member" "image_reader" {
  project    = var.project_id
  location   = local.region
  repository = "longbeach"
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.vm.email}"
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each  = var.secret_refs
  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.vm.email}"
}

resource "google_secret_manager_secret" "postgres_admin" {
  project         = var.project_id
  secret_id       = "longbeach-vm-postgres-admin-password"
  deletion_policy = "PREVENT"
  labels          = local.labels
  replication {
    user_managed {
      replicas { location = local.region }
    }
  }
  lifecycle { prevent_destroy = true }
}

resource "google_secret_manager_secret_iam_member" "postgres_admin" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.postgres_admin.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.vm.email}"
}

resource "google_storage_bucket" "backup" {
  project                     = var.project_id
  name                        = var.backup_bucket_name
  location                    = local.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels
  soft_delete_policy { retention_duration_seconds = 604800 }
  # pgBackRest owns full/differential/WAL expiry; a blind age lifecycle could break recovery chains.
  lifecycle { prevent_destroy = true }
}

resource "google_storage_bucket_iam_member" "backup_objects" {
  bucket = google_storage_bucket.backup.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.vm.email}"
  condition {
    title = "longbeach_backup_prefix"
    # Listing is checked on the bucket, not individual objects. This dedicated bucket contains LongBeach only.
    expression = "resource.name == 'projects/_/buckets/${var.backup_bucket_name}' || resource.name.startsWith('projects/_/buckets/${var.backup_bucket_name}/objects/${var.backup_prefix}')"
  }
}

resource "google_storage_bucket_iam_member" "bootstrap_reader" {
  bucket = var.bootstrap_bundle.bucket
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.vm.email}"
  condition {
    title      = "longbeach_exact_bootstrap_object"
    expression = "resource.name == 'projects/_/buckets/${var.bootstrap_bundle.bucket}/objects/${var.bootstrap_bundle.object}'"
  }
}

resource "google_compute_network" "vm" {
  project                 = var.project_id
  name                    = "longbeach-economy"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "vm" {
  project                  = var.project_id
  name                     = "longbeach-economy-sp"
  region                   = local.region
  network                  = google_compute_network.vm.id
  ip_cidr_range            = "10.84.0.0/28"
  private_ip_google_access = true
}

resource "google_compute_firewall" "iap_ssh" {
  project       = var.project_id
  name          = "longbeach-economy-iap-ssh"
  network       = google_compute_network.vm.name
  direction     = "INGRESS"
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["longbeach-economy"]
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_compute_firewall" "public_https" {
  count         = var.public_ingress_enabled ? 1 : 0
  project       = var.project_id
  name          = "longbeach-economy-approved-https"
  network       = google_compute_network.vm.name
  direction     = "INGRESS"
  source_ranges = var.public_source_ranges
  target_tags   = ["longbeach-economy"]
  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
  depends_on = [terraform_data.deployment_guards]
}

resource "google_compute_address" "vm" {
  project      = var.project_id
  name         = "longbeach-economy-ip"
  region       = local.region
  address_type = "EXTERNAL"
  network_tier = "PREMIUM"
  labels       = local.labels
}

resource "google_compute_disk" "data" {
  project = var.project_id
  name    = "longbeach-economy-postgres"
  zone    = local.zone
  type    = "pd-balanced"
  size    = 20
  labels  = merge(local.labels, { purpose = "postgres-data" })
  lifecycle { prevent_destroy = true }
}

resource "google_compute_instance" "vm" {
  project             = var.project_id
  name                = "longbeach-economy"
  zone                = local.zone
  machine_type        = "e2-medium"
  deletion_protection = true
  can_ip_forward      = false
  tags                = ["longbeach-economy"]
  labels              = local.labels

  boot_disk {
    auto_delete = false
    initialize_params {
      image = var.boot_image
      size  = 10
      type  = "pd-balanced"
    }
  }
  attached_disk {
    source      = google_compute_disk.data.id
    device_name = "longbeach-postgres"
    mode        = "READ_WRITE"
  }
  network_interface {
    subnetwork = google_compute_subnetwork.vm.id
    access_config {
      nat_ip       = google_compute_address.vm.address
      network_tier = "PREMIUM"
    }
  }
  service_account {
    email  = google_service_account.vm.email
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }
  metadata = {
    enable-oslogin           = "TRUE"
    block-project-ssh-keys   = "TRUE"
    disable-legacy-endpoints = "TRUE"
    serial-port-enable       = "FALSE"
    # References/configuration only. No keys, passwords, tokens or connection-string values.
    longbeach-bootstrap-manifest = jsonencode(local.manifest)
    # First migrate this attribute with the existing bundle unchanged; review the saved plan.
    startup-script = templatefile("${path.module}/startup.sh.tftpl", {
      bundle_json_b64 = base64encode(jsonencode(var.bootstrap_bundle))
    })
  }
  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }
  scheduling {
    automatic_restart   = true
    on_host_maintenance = "MIGRATE"
    provisioning_model  = "STANDARD"
    preemptible         = false
  }
  lifecycle { prevent_destroy = true }
  depends_on = [
    terraform_data.deployment_guards, google_artifact_registry_repository_iam_member.image_reader,
    google_secret_manager_secret_iam_member.runtime, google_secret_manager_secret_iam_member.postgres_admin,
    google_storage_bucket_iam_member.bootstrap_reader,
    google_storage_bucket_iam_member.backup_objects, google_compute_firewall.iap_ssh
  ]
}
