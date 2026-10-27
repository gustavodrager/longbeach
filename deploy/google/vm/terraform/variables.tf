variable "project_id" {
  type    = string
  default = "parsero-prod-20261022"
  validation {
    condition     = var.project_id == "parsero-prod-20261022"
    error_message = "This isolated migration module is for the existing LongBeach production project only."
  }
}

variable "boot_image" {
  description = "Reviewed immutable Debian 13 amd64 image name/self-link, not an image family. Resolve it read-only before planning."
  type        = string
  validation {
    condition     = can(regex("^(https://www.googleapis.com/compute/v1/)?projects/debian-cloud/global/images/debian-13-trixie-v[0-9]+$", var.boot_image))
    error_message = "Supply an exact Debian 13 image version; mutable families are not accepted."
  }
}

variable "api_image" {
  description = "The currently published production API, frozen for the infrastructure migration."
  type        = string
  default     = "southamerica-east1-docker.pkg.dev/parsero-prod-20261022/longbeach/api@sha256:b8e6fdc254cc1226ea25881e046a6e627a8eefa2b4c354bc98059aa6a79ab548"
  validation {
    condition     = var.api_image == "southamerica-east1-docker.pkg.dev/parsero-prod-20261022/longbeach/api@sha256:b8e6fdc254cc1226ea25881e046a6e627a8eefa2b4c354bc98059aa6a79ab548"
    error_message = "Migrate only the reviewed current production digest; a feature release requires separate review."
  }
}

variable "postgres_backup_image" {
  description = "Reviewed PostgreSQL 18 + pgBackRest image in the LongBeach AR repository, pinned by digest."
  type        = string
  validation {
    condition     = can(regex("^southamerica-east1-docker\\.pkg\\.dev/parsero-prod-20261022/longbeach/postgres-backup@sha256:[a-f0-9]{64}$", var.postgres_backup_image))
    error_message = "Use the reviewed immutable LongBeach PostgreSQL backup image."
  }
}

variable "caddy_image" {
  description = "Official Caddy image, pinned by reviewed digest rather than a mutable version tag."
  type        = string
  validation {
    condition     = can(regex("^docker\\.io/library/caddy@sha256:[a-f0-9]{64}$", var.caddy_image))
    error_message = "Use an immutable official Caddy image digest."
  }
}

variable "bootstrap_bundle" {
  description = "Private GCS tar.gz, immutable by generation and SHA-256; contains bin/bootstrap-vm. No credentials or database dumps."
  type = object({
    bucket     = string
    object     = string
    generation = string
    sha256     = string
  })
  validation {
    condition = (can(regex("^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$", var.bootstrap_bundle.bucket)) &&
      can(regex("^[A-Za-z0-9][A-Za-z0-9._/-]+\\.tar\\.gz$", var.bootstrap_bundle.object)) &&
      !strcontains(var.bootstrap_bundle.object, "..") &&
      can(regex("^[1-9][0-9]+$", var.bootstrap_bundle.generation)) &&
    can(regex("^[a-f0-9]{64}$", var.bootstrap_bundle.sha256)))
    error_message = "Use a concrete private GCS object, positive generation and lowercase SHA-256."
  }
}

variable "secret_refs" {
  description = "Existing Secret Manager references only. Values are retrieved by the VM helper, never Terraform."
  type = map(object({
    secret_id = string
    version   = string
  }))
  default = {
    ConnectionStrings__LongBeach    = { secret_id = "longbeach-db-runtime-connection", version = "1" }
    Authentication__Jwt__SigningKey = { secret_id = "longbeach-jwt-signing-key", version = "1" }
    Authentication__Google__AllowedEmail = {
      secret_id = "longbeach-google-allowed-email", version = "1"
    }
    Integrations__PagBankEdi__Token = { secret_id = "longbeach-pagbank-edi-token", version = "1" }
    Integrations__PagBankEdi__User  = { secret_id = "longbeach-pagbank-edi-user", version = "1" }
  }
  validation {
    condition = (toset(keys(var.secret_refs)) == toset([
      "ConnectionStrings__LongBeach", "Authentication__Jwt__SigningKey", "Authentication__Google__AllowedEmail",
      "Integrations__PagBankEdi__Token", "Integrations__PagBankEdi__User"
      ]) && alltrue([for ref in values(var.secret_refs) : can(regex("^[1-9][0-9]*$", ref.version))]) &&
      try(var.secret_refs.ConnectionStrings__LongBeach.secret_id, "") == "longbeach-db-runtime-connection" &&
      try(var.secret_refs.Authentication__Jwt__SigningKey.secret_id, "") == "longbeach-jwt-signing-key" &&
      try(var.secret_refs.Authentication__Google__AllowedEmail.secret_id, "") == "longbeach-google-allowed-email" &&
      try(var.secret_refs.Integrations__PagBankEdi__Token.secret_id, "") == "longbeach-pagbank-edi-token" &&
    try(var.secret_refs.Integrations__PagBankEdi__User.secret_id, "") == "longbeach-pagbank-edi-user")
    error_message = "Only the five existing LongBeach runtime secret references with numbered versions are allowed; no admin/migrator credentials."
  }
}

variable "postgres_admin_secret_version" {
  description = "Numbered version populated outside Terraform with a new VM-only administrative password. No password value enters state."
  type        = string
  default     = "1"
  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.postgres_admin_secret_version))
    error_message = "Use an explicit numbered version of the VM-only administrative password."
  }
}

variable "public_environment" {
  description = "Reviewed non-secret application settings. Core domains and startup safety gates are fixed by this module."
  type        = map(string)
  default     = {}
  validation {
    condition = (length(var.public_environment) == length(toset([for name in keys(var.public_environment) : lower(name)])) &&
      alltrue([for name in keys(var.public_environment) : can(regex("^[A-Za-z_][A-Za-z0-9_]*$", name)) &&
        (!can(regex("(?i)(password|secret|credential|connectionstring|signingkey|token)", name)) ||
        contains(["authentication__jwt__accesstokenminutes", "authentication__jwt__refreshtokendays"], lower(name))) &&
        !contains([
          "aspnetcore_environment", "aspnetcore_urls", "database__migrateonstartup", "authorization__seedonstartup",
          "bootstrap__initialowner__enabled", "authentication__google__provisionallowedemailsasowners", "backgroundjobs__enabled",
          "cors__allowedorigins__0", "authentication__cookiedomain", "reverseproxy__trustallforwarders",
          "authentication__google__allowedemail", "integrations__pagbankedi__user"
    ], lower(name))]))
    error_message = "Do not pass secrets, duplicate .NET setting names, or override the fixed startup/domain safety settings."
  }
}

variable "backup_bucket_name" {
  type    = string
  default = "parsero-prod-20261022-longbeach-vm-backups"
  validation {
    condition     = can(regex("^parsero-prod-20261022-longbeach-[a-z0-9-]+$", var.backup_bucket_name))
    error_message = "Use a new LongBeach-only production backup bucket."
  }
}

variable "backup_prefix" {
  type    = string
  default = "pgbackrest/longbeach/"
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9/_-]+/$", var.backup_prefix)) && !strcontains(var.backup_prefix, "..")
    error_message = "Use an explicit relative LongBeach backup prefix ending with /."
  }
}

variable "public_ingress_enabled" {
  description = "Initially false. Enables only HTTP/HTTPS; does not change DNS or start database consumers."
  type        = bool
  default     = false
}

variable "public_ingress_approved" {
  description = "Human-approved restricted test or cutover gate; must be reviewed with the plan."
  type        = bool
  default     = false
}

variable "public_source_ranges" {
  description = "Explicit approved IPv4 CIDRs; use the tester /32 for candidate tests. Public cutover needs an explicitly approved 0.0.0.0/0."
  type        = set(string)
  default     = []
  validation {
    condition     = alltrue([for cidr in var.public_source_ranges : can(cidrnetmask(cidr))])
    error_message = "Only explicit IPv4 CIDRs are accepted."
  }
}
