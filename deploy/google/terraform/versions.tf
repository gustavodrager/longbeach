terraform {
  required_version = ">= 1.11, < 2.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 8.6.0"
    }
  }

  # Supply a pre-created, private, versioned GCS bucket and a unique environment prefix at init.
  backend "gcs" {}
}

provider "google" {
  project               = local.project_id
  region                = local.region
  billing_project       = local.project_id
  user_project_override = true
}

provider "google-beta" {
  project               = local.project_id
  region                = local.region
  billing_project       = local.project_id
  user_project_override = true
}
