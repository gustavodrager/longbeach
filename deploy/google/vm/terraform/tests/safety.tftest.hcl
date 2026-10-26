mock_provider "google" {}

variables {
  boot_image            = "projects/debian-cloud/global/images/debian-13-trixie-v20261023"
  postgres_backup_image = "southamerica-east1-docker.pkg.dev/parsero-prod-20261022/longbeach/postgres-backup@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  caddy_image           = "docker.io/library/caddy@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  bootstrap_bundle = {
    bucket     = "parsero-prod-longbeach-migration"
    object     = "vm-bootstrap/longbeach/reviewed.tar.gz"
    generation = "1234567890123456"
    sha256     = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}

run "private_candidate_preserves_data_and_current_production" {
  command = plan
  assert {
    condition = (google_compute_instance.vm.metadata["startup-script"] == templatefile("${path.module}/startup.sh.tftpl", {
      bundle_json_b64 = base64encode(jsonencode(var.bootstrap_bundle))
    }) && (google_compute_instance.vm.metadata_startup_script == null || google_compute_instance.vm.metadata_startup_script == ""))
    error_message = "Keep the same bootstrap bytes in normal metadata; do not reintroduce the replacement-triggering startup attribute. Review the real transition plan with the existing bundle unchanged."
  }
  assert {
    condition = (google_compute_instance.vm.machine_type == "e2-medium" && google_compute_instance.vm.zone == "southamerica-east1-a" &&
      google_compute_instance.vm.boot_disk[0].initialize_params[0].size == 10 && google_compute_instance.vm.boot_disk[0].initialize_params[0].type == "pd-balanced" &&
      google_compute_disk.data.size == 20 && google_compute_disk.data.type == "pd-balanced" &&
      google_compute_instance.vm.boot_disk[0].auto_delete == false && google_compute_instance.vm.deletion_protection &&
    google_compute_instance.vm.scheduling[0].preemptible == false && google_compute_instance.vm.scheduling[0].provisioning_model == "STANDARD")
    error_message = "Use the reviewed São Paulo e2-medium with separate 10+20 GiB persistent disks; no Spot or automatic disk deletion."
  }
  assert {
    condition = (length(google_compute_firewall.public_https) == 0 &&
      google_compute_firewall.iap_ssh.source_ranges == toset(["35.235.240.0/20"]) &&
      one(google_compute_firewall.iap_ssh.allow).ports == tolist(["22"]) &&
      google_compute_instance.vm.metadata["enable-oslogin"] == "TRUE" &&
      google_compute_instance.vm.metadata["block-project-ssh-keys"] == "TRUE" &&
    !contains(keys(google_compute_instance.vm.metadata), "ssh-keys"))
    error_message = "Initial candidate stays private; SSH must use IAP and individual OS Login, not project keys."
  }
  assert {
    condition = (local.manifest.gates == { database_restore_approved = false, runtime_enabled = false, workers_enabled = false } &&
      local.manifest.public_environment.BackgroundJobs__Enabled == "false" &&
      local.manifest.public_environment.Database__MigrateOnStartup == "false" &&
      local.manifest.public_environment.Authorization__SeedOnStartup == "false" &&
      local.manifest.public_environment.Bootstrap__InitialOwner__Enabled == "false" &&
    local.manifest.public_environment.Authentication__Google__ProvisionAllowedEmailsAsOwners == "false")
    error_message = "Startup must not restore data, migrate, seed, start runtime or duplicate source workers."
  }
  assert {
    condition = (google_storage_bucket.backup.uniform_bucket_level_access && google_storage_bucket.backup.public_access_prevention == "enforced" &&
      google_storage_bucket.backup.force_destroy == false && google_storage_bucket.backup.location == "southamerica-east1" &&
      length(google_storage_bucket.backup.lifecycle_rule) == 0 &&
      google_storage_bucket_iam_member.backup_objects.role == "roles/storage.objectUser" &&
    strcontains(google_storage_bucket_iam_member.backup_objects.condition[0].expression, "/objects/pgbackrest/longbeach/"))
    error_message = "Keep backups private, outside the VM, prefix-scoped and managed by pgBackRest retention rather than blind GCS age deletion."
  }
  assert {
    condition = (length(google_secret_manager_secret_iam_member.runtime) == 5 &&
      google_artifact_registry_repository_iam_member.image_reader.repository == "longbeach" &&
      google_artifact_registry_repository_iam_member.image_reader.role == "roles/artifactregistry.reader" &&
      google_storage_bucket_iam_member.bootstrap_reader.condition[0].expression == "resource.name == 'projects/_/buckets/parsero-prod-longbeach-migration/objects/vm-bootstrap/longbeach/reviewed.tar.gz'" &&
    google_compute_instance.vm.service_account[0].scopes == toset(["https://www.googleapis.com/auth/cloud-platform"]))
    error_message = "IAM must be bound to this repository, exact bundle object, runtime secrets and own backup bucket. OAuth scope alone must grant no project role."
  }
  assert {
    condition = (google_secret_manager_secret.postgres_admin.secret_id == "longbeach-vm-postgres-admin-password" &&
      google_secret_manager_secret.postgres_admin.deletion_policy == "PREVENT" &&
      local.manifest.postgres_admin_secret.version == "1" &&
    !contains([for ref in values(var.secret_refs) : ref.secret_id], "longbeach-db-migration-connection"))
    error_message = "VM PostgreSQL administration needs a separate new password reference, never the Cloud SQL migrator/admin identity."
  }
}

run "reject_unapproved_public_ingress" {
  command = plan
  variables {
    public_ingress_enabled = true
    public_source_ranges   = ["0.0.0.0/0"]
  }
  expect_failures = [terraform_data.deployment_guards]
}

run "reject_approved_public_ingress_without_sources" {
  command = plan
  variables {
    public_ingress_enabled  = true
    public_ingress_approved = true
  }
  expect_failures = [terraform_data.deployment_guards]
}

run "approved_candidate_test_exposes_only_https_and_http" {
  command = plan
  variables {
    public_ingress_enabled  = true
    public_ingress_approved = true
    public_source_ranges    = ["203.0.113.8/32"]
  }
  assert {
    condition = (google_compute_firewall.public_https[0].source_ranges == toset(["203.0.113.8/32"]) &&
    one(google_compute_firewall.public_https[0].allow).ports == tolist(["80", "443"]))
    error_message = "Restricted candidate approval must not open PostgreSQL, API container ports or SSH to the internet."
  }
}

run "reject_mutable_boot_family" {
  command = plan
  variables { boot_image = "projects/debian-cloud/global/images/family/debian-13" }
  expect_failures = [var.boot_image]
}

run "reject_different_api_release" {
  command = plan
  variables {
    api_image = "southamerica-east1-docker.pkg.dev/parsero-prod-20261022/longbeach/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
  expect_failures = [var.api_image]
}

run "reject_startup_safety_override" {
  command = plan
  variables { public_environment = { backgroundjobs__enabled = "true" } }
  expect_failures = [var.public_environment]
}

run "reject_plain_secret" {
  command = plan
  variables { public_environment = { Integrations__PagBankEdi__Token = "must-use-secret-reference" } }
  expect_failures = [var.public_environment]
}

run "reject_personal_or_credential_identity_settings_in_metadata" {
  command = plan
  variables {
    public_environment = {
      Authentication__Google__AllowedEmail = "fictional-person@example.invalid"
      Integrations__PagBankEdi__User       = "fictional-provider-username"
    }
  }
  expect_failures = [var.public_environment]
}

run "reject_latest_secret_version" {
  command = plan
  variables {
    secret_refs = {
      ConnectionStrings__LongBeach         = { secret_id = "longbeach-db-runtime-connection", version = "latest" }
      Authentication__Jwt__SigningKey      = { secret_id = "longbeach-jwt-signing-key", version = "1" }
      Authentication__Google__AllowedEmail = { secret_id = "longbeach-google-allowed-email", version = "1" }
      Integrations__PagBankEdi__Token      = { secret_id = "longbeach-pagbank-edi-token", version = "1" }
      Integrations__PagBankEdi__User       = { secret_id = "longbeach-pagbank-edi-user", version = "1" }
    }
  }
  expect_failures = [var.secret_refs]
}

run "reject_admin_secret_access" {
  command = plan
  variables {
    secret_refs = {
      ConnectionStrings__LongBeach         = { secret_id = "parsero-postgres-admin-password", version = "1" }
      Authentication__Jwt__SigningKey      = { secret_id = "longbeach-jwt-signing-key", version = "1" }
      Authentication__Google__AllowedEmail = { secret_id = "longbeach-google-allowed-email", version = "1" }
      Integrations__PagBankEdi__Token      = { secret_id = "longbeach-pagbank-edi-token", version = "1" }
      Integrations__PagBankEdi__User       = { secret_id = "longbeach-pagbank-edi-user", version = "1" }
    }
  }
  expect_failures = [var.secret_refs]
}
