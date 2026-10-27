locals {
  project_id = var.project_ids[var.environment]
  region     = "southamerica-east1"
  app_ready  = var.api_image != "" && var.enable_api_service
  site_id    = var.firebase_site_id != "" ? var.firebase_site_id : local.project_id
  databases = toset(concat(["longbeach"],
    var.enable_lavamais_database ? ["lavamais"] : [],
    var.enable_danielli_database ? ["danielli"] : []
  ))
  core_secret_suffixes = toset(["db-runtime-connection", "db-migration-connection", "jwt-signing-key"])
  secret_suffixes      = setunion(local.core_secret_suffixes, toset([for s in values(var.extra_runtime_secrets) : s.secret_suffix]))
  runtime_secrets = merge({
    ConnectionStrings__LongBeach    = { secret_suffix = "db-runtime-connection", version = var.db_runtime_secret_version }
    Authentication__Jwt__SigningKey = { secret_suffix = "jwt-signing-key", version = var.jwt_secret_version }
  }, var.extra_runtime_secrets)
  migration_secrets = {
    ConnectionStrings__LongBeach    = { secret_suffix = "db-migration-connection", version = var.db_migration_secret_version }
    Authentication__Jwt__SigningKey = { secret_suffix = "jwt-signing-key", version = var.jwt_secret_version }
  }
  safety_environment = {
    ASPNETCORE_ENVIRONMENT                                 = var.environment == "production" ? "Production" : "Staging"
    ASPNETCORE_URLS                                        = "http://+:8080"
    Database__MigrateOnStartup                             = "false"
    Authorization__SeedOnStartup                           = "false"
    Bootstrap__InitialOwner__Enabled                       = "false"
    Authentication__Google__ProvisionAllowedEmailsAsOwners = "false"
    BackgroundJobs__Enabled                                = tostring(var.workers_enabled)
    Cors__AllowedOrigins__0                                = var.web_origin
    Authentication__CookieDomain                           = var.csrf_cookie_domain
    ReverseProxy__TrustAllForwarders                       = "true"
  }
  # .NET configuration keys are case-insensitive, even though Terraform map keys are not.
  reserved_environment_names = toset(concat(
    [for name in keys(local.safety_environment) : lower(name)],
    ["connectionstrings__longbeach", "authentication__jwt__signingkey"]
  ))
  api_environment       = merge(var.runtime_environment, local.safety_environment)
  migration_environment = merge(local.api_environment, { BackgroundJobs__Enabled = "false" })
  apis = toset([
    "artifactregistry.googleapis.com", "billingbudgets.googleapis.com", "cloudresourcemanager.googleapis.com",
    "compute.googleapis.com", "certificatemanager.googleapis.com", "firebase.googleapis.com", "firebasehosting.googleapis.com", "iam.googleapis.com",
    "logging.googleapis.com", "monitoring.googleapis.com", "run.googleapis.com", "secretmanager.googleapis.com",
    "serviceusage.googleapis.com", "sqladmin.googleapis.com"
  ])
}

resource "terraform_data" "deployment_guards" {
  lifecycle {
    precondition {
      condition     = var.environment == "production" && local.project_id == "parsero-prod-20261022"
      error_message = "This root supports only the migrated LongBeach production project."
    }
    precondition {
      condition     = !var.workers_enabled && !var.public_api_enabled && !var.enable_lavamais_database && !var.enable_danielli_database
      error_message = "The retired managed source cannot run workers, expose an API, or manage another client."
    }
  }
}

resource "google_project_service" "required" {
  for_each           = local.apis
  project            = local.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_secret_manager_secret" "longbeach" {
  for_each  = local.secret_suffixes
  project   = local.project_id
  secret_id = "longbeach-${each.value}"
  replication {
    user_managed {
      replicas { location = local.region }
    }
  }
  labels = { application = "longbeach", environment = var.environment }
  lifecycle { prevent_destroy = true }
  depends_on = [google_project_service.required]
}

# Administrative recovery only. Values are uploaded outside Terraform, and neither
# application identity receives access to this container.

resource "google_secret_manager_secret" "database_admin" {
  project         = local.project_id
  secret_id       = "parsero-postgres-admin-password"
  deletion_policy = "PREVENT"
  replication {
    user_managed {
      replicas { location = local.region }
    }
  }
  labels = {
    owner       = "parsero"
    environment = var.environment
    purpose     = "database-administration"
  }
  lifecycle { prevent_destroy = true }
  depends_on = [google_project_service.required]
}

resource "google_artifact_registry_repository" "longbeach" {
  project       = local.project_id
  location      = local.region
  repository_id = "longbeach"
  description   = "LongBeach API images identified by verified source commit and digest"
  format        = "DOCKER"
  docker_config { immutable_tags = true }
  depends_on = [google_project_service.required]
}

resource "google_firebase_project" "selected" {
  provider   = google-beta
  project    = local.project_id
  depends_on = [google_project_service.required]
}

resource "google_firebase_hosting_site" "longbeach" {
  provider        = google-beta
  project         = local.project_id
  site_id         = local.site_id
  deletion_policy = "PREVENT"
  depends_on      = [google_firebase_project.selected]
}

resource "google_firebase_hosting_custom_domain" "web" {
  count                 = var.create_web_custom_domain ? 1 : 0
  provider              = google-beta
  project               = local.project_id
  site_id               = google_firebase_hosting_site.longbeach.site_id
  custom_domain         = trimprefix(var.web_origin, "https://")
  wait_dns_verification = false
  lifecycle {
    precondition {
      condition     = var.web_origin != ""
      error_message = "web_origin is required before preparing a custom domain."
    }
  }
}
