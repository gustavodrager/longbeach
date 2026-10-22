resource "google_cloud_run_v2_service" "api" {
  count                = local.app_ready ? 1 : 0
  project              = local.project_id
  name                 = "longbeach-api"
  location             = local.region
  deletion_protection  = true
  ingress              = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  invoker_iam_disabled = false

  scaling { max_instance_count = 1 }

  template {
    service_account                  = google_service_account.runtime.email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    timeout                          = "300s"
    max_instance_request_concurrency = 40
    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance { instances = [google_sql_database_instance.shared.connection_name] }
    }
    containers {
      image = var.api_image
      ports { container_port = 8080 }
      resources {
        limits            = { cpu = "1", memory = "2Gi" }
        cpu_idle          = false
        startup_cpu_boost = true
      }
      dynamic "env" {
        for_each = local.api_environment
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.runtime_secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.longbeach[env.value.secret_suffix].secret_id
              version = env.value.version
            }
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
      startup_probe {
        initial_delay_seconds = 0
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 24
        http_get { path = "/health/ready" }
      }
      liveness_probe {
        timeout_seconds   = 5
        period_seconds    = 30
        failure_threshold = 3
        http_get { path = "/health/live" }
      }
    }
  }

  lifecycle {
    precondition {
      condition = (var.api_domain != "" && var.web_origin != "" && var.csrf_cookie_domain != "" &&
        trimprefix(var.web_origin, "https://") == var.csrf_cookie_domain &&
      endswith(var.api_domain, ".${var.csrf_cookie_domain}"))
      error_message = "Supply API/web hosts and their narrow shared CSRF cookie domain before deploying."
    }
    precondition {
      condition     = startswith(var.api_image, "${local.region}-docker.pkg.dev/${local.project_id}/longbeach/")
      error_message = "The image must belong to the selected environment's Artifact Registry."
    }
    precondition {
      condition     = !var.workers_enabled || var.source_workers_disabled_confirmed
      error_message = "Disable the source workers and confirm that gate before enabling destination workers."
    }
    precondition {
      condition     = length(setintersection(toset([for name in keys(local.api_environment) : lower(name)]), toset([for name in keys(local.runtime_secrets) : lower(name)]))) == 0
      error_message = "A setting cannot be supplied both as plaintext environment configuration and as a secret."
    }
  }
  depends_on = [google_project_iam_member.sql_client, google_secret_manager_secret_iam_member.runtime]
}

resource "google_cloud_run_v2_service_iam_member" "public_api" {
  count    = local.app_ready && var.public_api_enabled ? 1 : 0
  project  = local.project_id
  location = local.region
  name     = google_cloud_run_v2_service.api[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_job" "migration" {
  count               = var.api_image != "" ? 1 : 0
  project             = local.project_id
  name                = "longbeach-migrate"
  location            = local.region
  deletion_protection = true
  template {
    task_count  = 1
    parallelism = 1
    template {
      service_account       = google_service_account.migration.email
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
      timeout               = "1800s"
      max_retries           = 0
      volumes {
        name = "cloudsql"
        cloud_sql_instance { instances = [google_sql_database_instance.shared.connection_name] }
      }
      containers {
        image   = var.api_image
        command = ["dotnet"]
        args    = ["LongBeach.Api.dll", "--migrate-only"]
        resources { limits = { cpu = "1", memory = "2Gi" } }
        dynamic "env" {
          for_each = local.migration_environment
          content {
            name  = env.key
            value = env.value
          }
        }
        dynamic "env" {
          for_each = local.migration_secrets
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = google_secret_manager_secret.longbeach[env.value.secret_suffix].secret_id
                version = env.value.version
              }
            }
          }
        }
        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }
  }
  lifecycle {
    precondition {
      condition     = startswith(var.api_image, "${local.region}-docker.pkg.dev/${local.project_id}/longbeach/")
      error_message = "The migration image must belong to the selected environment's Artifact Registry."
    }
  }
  depends_on = [google_project_iam_member.sql_client, google_secret_manager_secret_iam_member.migration]
}

# Serverless NEG traffic is accepted only through this managed HTTPS load balancer.
# DNS authorization allows issuing the new TLS certificate before changing the existing API A record.
resource "google_compute_global_address" "api" {
  count      = local.app_ready ? 1 : 0
  project    = local.project_id
  name       = "longbeach-api-ip"
  ip_version = "IPV4"
  depends_on = [google_project_service.required]
}

resource "google_certificate_manager_dns_authorization" "api" {
  count      = local.app_ready ? 1 : 0
  project    = local.project_id
  name       = "longbeach-api-dns"
  domain     = var.api_domain
  type       = "PER_PROJECT_RECORD"
  depends_on = [google_project_service.required]
}

resource "google_certificate_manager_certificate" "api" {
  count   = local.app_ready ? 1 : 0
  project = local.project_id
  name    = "longbeach-api-tls"
  managed {
    domains            = [var.api_domain]
    dns_authorizations = [google_certificate_manager_dns_authorization.api[0].id]
  }
}

resource "google_certificate_manager_certificate_map" "api" {
  count      = local.app_ready ? 1 : 0
  project    = local.project_id
  name       = "longbeach-api-certificates"
  depends_on = [google_project_service.required]
}

resource "google_certificate_manager_certificate_map_entry" "api" {
  count        = local.app_ready ? 1 : 0
  project      = local.project_id
  name         = "longbeach-api-host"
  map          = google_certificate_manager_certificate_map.api[0].name
  hostname     = var.api_domain
  certificates = [google_certificate_manager_certificate.api[0].id]
}

resource "google_compute_region_network_endpoint_group" "api" {
  count                 = local.app_ready ? 1 : 0
  project               = local.project_id
  name                  = "longbeach-api"
  region                = local.region
  network_endpoint_type = "SERVERLESS"
  cloud_run { service = google_cloud_run_v2_service.api[0].name }
}

resource "google_compute_backend_service" "api" {
  count                 = local.app_ready ? 1 : 0
  project               = local.project_id
  name                  = "longbeach-api"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  enable_cdn            = false
  backend { group = google_compute_region_network_endpoint_group.api[0].id }
  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

resource "google_compute_url_map" "api" {
  count           = local.app_ready ? 1 : 0
  project         = local.project_id
  name            = "longbeach-api"
  default_service = google_compute_backend_service.api[0].id
}

resource "google_compute_ssl_policy" "api" {
  count           = local.app_ready ? 1 : 0
  project         = local.project_id
  name            = "longbeach-api-tls12"
  min_tls_version = "TLS_1_2"
  profile         = "MODERN"
}

resource "google_compute_target_https_proxy" "api" {
  count           = local.app_ready ? 1 : 0
  project         = local.project_id
  name            = "longbeach-api"
  url_map         = google_compute_url_map.api[0].id
  certificate_map = "//certificatemanager.googleapis.com/${google_certificate_manager_certificate_map.api[0].id}"
  ssl_policy      = google_compute_ssl_policy.api[0].id
  depends_on      = [google_certificate_manager_certificate_map_entry.api]
}

resource "google_compute_global_forwarding_rule" "api_https" {
  count                 = local.app_ready ? 1 : 0
  project               = local.project_id
  name                  = "longbeach-api-https"
  ip_address            = google_compute_global_address.api[0].address
  target                = google_compute_target_https_proxy.api[0].id
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

resource "google_compute_url_map" "http_redirect" {
  count   = local.app_ready ? 1 : 0
  project = local.project_id
  name    = "longbeach-api-http-redirect"
  default_url_redirect {
    https_redirect         = true
    strip_query            = false
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  count   = local.app_ready ? 1 : 0
  project = local.project_id
  name    = "longbeach-api-http-redirect"
  url_map = google_compute_url_map.http_redirect[0].id
}

resource "google_compute_global_forwarding_rule" "api_http" {
  count                 = local.app_ready ? 1 : 0
  project               = local.project_id
  name                  = "longbeach-api-http"
  ip_address            = google_compute_global_address.api[0].address
  target                = google_compute_target_http_proxy.redirect[0].id
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}
