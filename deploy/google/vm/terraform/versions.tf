terraform {
  required_version = ">= 1.11, < 2.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.6.0"
    }
  }

  # Initialize with an independent prefix. Never reuse deploy/google/terraform state.
  backend "gcs" {}
}

provider "google" {
  project               = var.project_id
  region                = "southamerica-east1"
  zone                  = "southamerica-east1-a"
  billing_project       = var.project_id
  user_project_override = true
}
