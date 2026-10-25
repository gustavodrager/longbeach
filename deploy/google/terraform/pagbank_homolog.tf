# Private deployment proposal only. Defaults preserve the existing production
# configuration; this mode may be enabled only in the isolated staging project.
variable "enable_pagbank_homolog" {
  type        = bool
  default     = false
  description = "Use the exclusive fictitious-data PagBank review database in staging."
  validation {
    condition     = !var.enable_pagbank_homolog || var.environment == "staging"
    error_message = "PagBank homologation is staging-only."
  }
}

variable "enable_homologation_prepare_job" {
  type        = bool
  default     = false
  description = "Prepare an explicit one-task fixture job after the exclusive database has 27 verified migrations. Creating the job never executes it. Disable again after successful preparation."
  validation {
    condition     = !var.enable_homologation_prepare_job || (var.enable_pagbank_homolog && var.homologation_credentials_ready)
    error_message = "The preparation job requires isolated staging homologation."
  }
}

variable "enable_homologation_endpoints" {
  type        = bool
  default     = false
  description = "Prepare only the isolated staging IP/TLS metadata before database credentials or API are ready. Does not create a Cloud Run service, backend, forwarding rule or public invocation."
  validation {
    condition     = !var.enable_homologation_endpoints || (var.enable_pagbank_homolog && var.environment == "staging")
    error_message = "Early endpoints are restricted to isolated staging homologation."
  }
}

variable "homologation_credentials_ready" {
  type        = bool
  default     = false
  description = "Enable dedicated DB/JWT references only after new SQL roles and all four numeric secret versions have been provisioned privately. False creates the foundation without changing existing staging consumers."
  validation {
    condition     = !var.homologation_credentials_ready || var.enable_pagbank_homolog
    error_message = "Dedicated homologation credentials require isolated staging homologation."
  }
}

variable "homologation_ready_for_public" {
  type        = bool
  default     = false
  description = "Explicit gate after exclusive database, migrations, fictitious login, private health and TLS have been checked."
}

variable "homologation_secret_versions" {
  type        = object({ runtime = string, migration = string, jwt = string, reviewer = string })
  default     = { runtime = "1", migration = "1", jwt = "1", reviewer = "1" }
  description = "Numeric Secret Manager version references, never secret values."
  validation {
    condition     = alltrue([for version in values(var.homologation_secret_versions) : can(regex("^[1-9][0-9]*$", version))])
    error_message = "Pin all homologation secrets to numeric versions."
  }
}

locals {
  homologation_enabled           = var.enable_pagbank_homolog && var.environment == "staging"
  homologation_credentials_ready = local.homologation_enabled && var.homologation_credentials_ready
  homologation_secret_suffixes = local.homologation_enabled ? toset([
    "homologation-db-runtime-connection", "homologation-db-migration-connection",
    "homologation-jwt-signing-key", "homologation-reviewer-password"
  ]) : toset([])
  homologation_runtime_secrets = {
    ConnectionStrings__LongBeach    = { secret_suffix = "homologation-db-runtime-connection", version = var.homologation_secret_versions.runtime }
    Authentication__Jwt__SigningKey = { secret_suffix = "homologation-jwt-signing-key", version = var.homologation_secret_versions.jwt }
  }
  homologation_migration_secrets = {
    ConnectionStrings__LongBeach    = { secret_suffix = "homologation-db-migration-connection", version = var.homologation_secret_versions.migration }
    Authentication__Jwt__SigningKey = { secret_suffix = "homologation-jwt-signing-key", version = var.homologation_secret_versions.jwt }
  }
  homologation_prepare_secrets = merge(local.homologation_runtime_secrets, {
    Homologation__ReviewerPassword = { secret_suffix = "homologation-reviewer-password", version = var.homologation_secret_versions.reviewer }
  })
  homologation_environment = local.homologation_credentials_ready ? {
    AllowedHosts                                      = var.api_domain
    Homologation__Enabled                             = "true"
    Homologation__AllowUnsignedNotificationHints      = "false"
    Authentication__Google__Enabled                   = "false"
    Authentication__Google__ClientRegistrationEnabled = "false"
    Authentication__Jwt__Issuer                       = "LongBeach.Homologation"
    Authentication__Jwt__Audience                     = "LongBeach.Homologation.Client"
    Payments__Billing__Enabled                        = "false"
    Payments__PagBank__Enabled                        = "false"
    Payments__PagBank__PixEnabled                     = "false"
    Payments__PagBank__CardEnabled                    = "false"
    Payments__PagBank__BaseUrl                        = "https://sandbox.api.pagseguro.com/"
    Payments__PagBankSubscriptions__Enabled           = "false"
    Payments__PagBankSubscriptions__BaseUrl           = "https://sandbox.api.assinaturas.pagseguro.com/"
    Integrations__PagBankEdi__Enabled                 = "false"
    Integrations__C6__Enabled                         = "false"
    Integrations__C6__BankingEnabled                  = "false"
    Integrations__C6__PixEnabled                      = "false"
    Integrations__C6__Environment                     = "Sandbox"
    DemoMode__PublicOperationalData                   = "false"
    Fiscal__Environment                               = "2"
  } : {}
}

resource "terraform_data" "homologation_guards" {
  count = local.homologation_enabled ? 1 : 0
  lifecycle {
    precondition {
      condition = (
        var.project_ids.staging == "parsero-staging-20261022" &&
        (!(local.homologation_credentials_ready || var.enable_homologation_endpoints) || (var.api_domain == "api.longbeach-homolog.quebranunca.com.br" &&
          var.web_origin == "https://longbeach-homolog.quebranunca.com.br" &&
        var.csrf_cookie_domain == "longbeach-homolog.quebranunca.com.br"))
      )
      error_message = "Use only the approved isolated staging project and sibling cookie domain."
    }
    precondition {
      condition = (!var.workers_enabled && length(var.extra_runtime_secrets) == 0 &&
      !var.enable_lavamais_database && !var.enable_danielli_database)
      error_message = "Homologation must keep all workers/external financial integrations disabled and must not add another client's databases or secrets."
    }
    precondition {
      condition = length(setintersection(
        toset([for name in keys(var.runtime_environment) : lower(name)]),
        toset([for name in keys(local.homologation_environment) : lower(name)])
      )) == 0
      error_message = "Do not override homologation controls, including through differently cased .NET environment names."
    }
    precondition {
      condition     = alltrue([for name in keys(var.runtime_environment) : !startswith(lower(name), "cors__allowedorigins__")])
      error_message = "Homologation CORS must use only its canonical web origin; do not inject additional indices or differently cased CORS names."
    }
    precondition {
      condition     = !var.public_api_enabled || var.homologation_ready_for_public
      error_message = "Public homologation requires explicit verified readiness; a prepared DNS record alone is insufficient."
    }
    precondition {
      condition     = !var.enable_api_service || local.homologation_credentials_ready
      error_message = "Do not create the homologation API before its exclusive SQL roles and new secrets are ready."
    }
  }
}

resource "google_sql_database" "pagbank_homolog" {
  count    = local.homologation_enabled ? 1 : 0
  project  = local.project_id
  instance = google_sql_database_instance.shared.name
  name     = "longbeach_pagbank_homolog"
  lifecycle { prevent_destroy = true }
}

resource "google_service_account" "homologation_prepare" {
  count        = local.homologation_enabled && var.enable_homologation_prepare_job ? 1 : 0
  project      = local.project_id
  account_id   = "longbeach-homolog-prepare"
  display_name = "LongBeach fictitious review preparation only"
  depends_on   = [google_project_service.required]
}

resource "google_project_iam_member" "homologation_prepare_sql" {
  count   = length(google_service_account.homologation_prepare)
  project = local.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.homologation_prepare[0].email}"
}

resource "google_secret_manager_secret_iam_member" "homologation_prepare" {
  for_each = local.homologation_enabled && var.enable_homologation_prepare_job ? toset([
    for binding in values(local.homologation_prepare_secrets) : binding.secret_suffix
  ]) : toset([])
  project   = local.project_id
  secret_id = google_secret_manager_secret.longbeach[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.homologation_prepare[0].email}"
}

resource "google_cloud_run_v2_job" "homologation_prepare" {
  count               = length(google_service_account.homologation_prepare)
  project             = local.project_id
  name                = "longbeach-prepare-homolog"
  location            = local.region
  deletion_protection = false
  template {
    task_count  = 1
    parallelism = 1
    template {
      service_account       = google_service_account.homologation_prepare[0].email
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
      timeout               = "600s"
      max_retries           = 0
      volumes {
        name = "cloudsql"
        cloud_sql_instance { instances = [google_sql_database_instance.shared.connection_name] }
      }
      containers {
        image   = var.api_image
        command = ["dotnet"]
        args    = ["LongBeach.Api.dll", "--prepare-pagbank-homologation"]
        resources { limits = { cpu = "1", memory = "2Gi" } }
        dynamic "env" {
          for_each = local.migration_environment
          content {
            name  = env.key
            value = env.value
          }
        }
        dynamic "env" {
          for_each = local.homologation_prepare_secrets
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
      condition = (local.homologation_enabled && var.api_image != "" &&
      startswith(var.api_image, "${local.region}-docker.pkg.dev/${local.project_id}/longbeach/"))
      error_message = "Preparation requires the approved immutable staging image."
    }
  }
  depends_on = [google_project_iam_member.homologation_prepare_sql, google_secret_manager_secret_iam_member.homologation_prepare, google_sql_database.pagbank_homolog, terraform_data.homologation_guards]
}

output "homologation_database_name" { value = try(google_sql_database.pagbank_homolog[0].name, null) }
output "homologation_prepare_job_name" { value = try(google_cloud_run_v2_job.homologation_prepare[0].name, null) }
output "homologation_sql_roles" {
  value = local.homologation_enabled ? {
    migrator = "longbeach_pagbank_homolog_migrator"
    runtime  = "longbeach_pagbank_homolog_runtime"
  } : null
}
