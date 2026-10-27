variable "environment" {
  type        = string
  description = "One environment per state. Never reuse a production state for staging."
  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "environment must be production or staging."
  }
}

variable "project_ids" {
  type        = object({ production = string, staging = string })
  description = "Existing projects with billing already linked. Terraform does not create accounts or projects."
  validation {
    condition = var.project_ids.production != var.project_ids.staging && alltrue([
      for id in [var.project_ids.production, var.project_ids.staging] : can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", id))
    ])
    error_message = "Supply distinct, valid production and staging project IDs."
  }
}

variable "billing_account_id" {
  type        = string
  description = "Existing billing account ID, without billingAccounts/; country and currency must be Brazil/BRL."
  validation {
    condition     = can(regex("^[A-Fa-f0-9]{6}-[A-Fa-f0-9]{6}-[A-Fa-f0-9]{6}$", var.billing_account_id))
    error_message = "Use the billing account ID in XXXXXX-XXXXXX-XXXXXX form."
  }
}

variable "pg_version" {
  type        = string
  description = "Set only after checking the source PostgreSQL major version; no implicit upgrade during migration."
  validation {
    condition     = contains(["POSTGRES_17", "POSTGRES_18"], var.pg_version)
    error_message = "Use the verified source PostgreSQL major version (POSTGRES_17 or POSTGRES_18)."
  }
}

variable "staging_database_activation_policy" {
  type        = string
  default     = "ALWAYS"
  description = "Set NEVER only for verified unused staging to stop instance compute while preserving data and prior backups. Restore ALWAYS before using the environment. Production suspension uses the separate managed_source_suspended opt-in."
  validation {
    condition = contains(["ALWAYS", "NEVER"], var.staging_database_activation_policy) && (
      var.staging_database_activation_policy == "ALWAYS" || var.environment == "staging"
    )
    error_message = "Only staging may use NEVER through staging_database_activation_policy."
  }
}

variable "managed_source_suspended" {
  type        = bool
  default     = false
  description = "Future production-source suspension after explicit migration acceptance and consumer checks: stop SQL compute and remove the two global forwarding rules. Preserve data, HA, backups, the already-paused Run and remaining LB resources. This flag grants no approval. Targets include dependencies: before any apply, require a separately reviewed plan with exactly one SQL policy update and two forwarding-rule deletions; refuse every Run or unrelated change."
  validation {
    condition = !var.managed_source_suspended || (
      var.environment == "production" && !var.workers_enabled &&
      !var.enable_lavamais_database && !var.enable_danielli_database
    )
    error_message = "Suspend only the migrated LongBeach production source, with source workers and both other client databases disabled."
  }
  validation {
    condition     = !var.managed_source_suspended || can(regex("^longbeach-api-freeze-[a-z0-9][a-z0-9-]{6,34}[a-z0-9]$", var.managed_source_revision))
    error_message = "Suspension requires the exact already-paused longbeach-api-freeze-* revision verified from the live source."
  }
}

variable "managed_source_revision" {
  type        = string
  default     = ""
  description = "Exact existing paused revision from the reviewed source inventory. Required only when managed_source_suspended is true; ignored otherwise. This preserves the revision rather than creating or ignoring a Run change."
}

variable "api_image" {
  type        = string
  default     = ""
  description = "Immutable image URI ending in @sha256:...; blank creates infrastructure only. An image prepares the migration job; enable_api_service separately after restoring and migrating."
  validation {
    condition     = var.api_image == "" || can(regex("^southamerica-east1-docker[.]pkg[.]dev/[a-z0-9-]+/longbeach/[a-z0-9_./-]+@sha256:[a-f0-9]{64}$", var.api_image))
    error_message = "api_image must be a São Paulo Artifact Registry longbeach image pinned by SHA-256 digest, or blank."
  }
}

variable "enable_api_service" {
  type        = bool
  default     = false
  description = "Deploy API and load balancer only after the isolated database, secret versions, restoration and migration checks are ready."
}

variable "public_api_enabled" {
  type        = bool
  default     = false
  description = "Grant unauthenticated Cloud Run invocation through the load balancer only after the explicit cutover gate. Candidates stay IAM-private even when the API and load balancer exist."
}

variable "cutover_gate_confirmed" {
  type        = bool
  default     = false
  description = "Confirm backup, validation and the approved transfer window before enabling public access. Independent of the source-worker gate."
}

variable "api_domain" {
  type        = string
  default     = ""
  description = "Environment-specific API DNS host. Required before deploying an image. No DNS records are changed by Terraform."
  validation {
    condition     = var.api_domain == "" || can(regex("^[a-z0-9][a-z0-9.-]+[.][a-z]{2,}$", var.api_domain))
    error_message = "Use a DNS host without scheme or path."
  }
}

variable "web_origin" {
  type        = string
  default     = ""
  description = "Exact HTTPS frontend origin for this environment. Required before deploying an image."
  validation {
    condition     = var.web_origin == "" || can(regex("^https://[a-z0-9][a-z0-9.-]+[.][a-z]{2,}$", var.web_origin))
    error_message = "web_origin must be an HTTPS origin without path or trailing slash."
  }
}

variable "csrf_cookie_domain" {
  type        = string
  default     = ""
  description = "Smallest shared DNS parent of web and API for the existing CSRF cookie. Never use the broad administrative root."
}

variable "firebase_site_id" {
  type        = string
  default     = ""
  description = "Globally unique Firebase Hosting site; defaults to the selected project ID."
}

variable "create_web_custom_domain" {
  type        = bool
  default     = false
  description = "Explicitly prepare the web custom domain only after validating the destination. Does not change DNS."
}

variable "workers_enabled" {
  type        = bool
  default     = false
  description = "Enable background processing only after disabling the source workers and completing the cutover checks."
}

variable "source_workers_disabled_confirmed" {
  type        = bool
  default     = false
  description = "Cutover gate. Must be true before workers_enabled can become true."
}

variable "db_runtime_secret_version" {
  type    = string
  default = "1"
  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.db_runtime_secret_version))
    error_message = "Pin the runtime connection secret to a numeric version."
  }
}

variable "db_migration_secret_version" {
  type    = string
  default = "1"
  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.db_migration_secret_version))
    error_message = "Pin the migration connection secret to a numeric version."
  }
}

variable "jwt_secret_version" {
  type    = string
  default = "1"
  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.jwt_secret_version))
    error_message = "Pin the JWT signing secret to a numeric version."
  }
}

variable "extra_runtime_secrets" {
  type = map(object({
    secret_suffix = string
    version       = string
  }))
  default     = {}
  description = "Additional LongBeach-only secret bindings: environment name => {secret_suffix, version}. Values are uploaded outside Terraform."
  validation {
    condition = length(distinct([for name in keys(var.extra_runtime_secrets) : lower(name)])) == length(var.extra_runtime_secrets) && alltrue([for name, binding in var.extra_runtime_secrets :
      can(regex("^[A-Za-z_][A-Za-z0-9_]*$", name)) &&
      can(regex("^[a-z][a-z0-9-]+$", binding.secret_suffix)) &&
      can(regex("^[1-9][0-9]*$", binding.version)) &&
      !contains(local.reserved_environment_names, lower(name)) &&
      !contains(["db-runtime-connection", "db-migration-connection", "jwt-signing-key"], binding.secret_suffix)
    ])
    error_message = "Use valid, case-insensitively unique env names, LongBeach secret suffixes and numeric versions; never override core secrets or deployment safety settings."
  }
}

variable "runtime_environment" {
  type        = map(string)
  default     = {}
  description = "Non-secret application settings only. Core safety settings below cannot be overridden."
  validation {
    condition = length(distinct([for name in keys(var.runtime_environment) : lower(name)])) == length(var.runtime_environment) && alltrue([for name, value in var.runtime_environment :
      can(regex("^[A-Za-z_][A-Za-z0-9_]*$", name)) &&
      (!can(regex("(?i)(password|token|secret|signingkey|connectionstrings|apikey|certificate|privatekey)", name)) ||
        # These public durations mirror JwtOptions validation; token credentials remain secrets.
        (lower(name) == "authentication__jwt__accesstokenminutes" && try(can(regex("^[0-9]+$", value)) && tonumber(value) >= 5 && tonumber(value) <= 120, false)) ||
      (lower(name) == "authentication__jwt__refreshtokendays" && try(can(regex("^[0-9]+$", value)) && tonumber(value) >= 1 && tonumber(value) <= 90, false))) &&
      !contains(local.reserved_environment_names, lower(name))
    ])
    error_message = "Use valid, case-insensitively unique env names without secrets or reserved safety settings. Only JWT AccessTokenMinutes (integer 5-120) and RefreshTokenDays (integer 1-90) may contain Token in a public setting name."
  }
}

variable "enable_lavamais_database" {
  type    = bool
  default = false
}

variable "enable_danielli_database" {
  type    = bool
  default = false
}

variable "manage_billing_budget" {
  type        = bool
  default     = false
  description = "Create the BRL 1,500 account-wide alert budget in production only, after confirming billing-budget permissions. No spending cap."
}

variable "budget_notification_channels" {
  type        = list(string)
  default     = []
  description = "Optional existing verified Cloud Monitoring notification channels. Billing administrators receive default emails as well."
}
