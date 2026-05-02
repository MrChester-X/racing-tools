terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }

  # Local state for now. To migrate to S3 backend later, uncomment and run
  # `terraform init -migrate-state`:
  #
  # backend "s3" {
  #   bucket         = "racing-tfstate-<account-id>"
  #   key            = "racing/terraform.tfstate"
  #   region         = "eu-central-1"
  #   dynamodb_table = "racing-tfstate-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.primary_region

  default_tags {
    tags = {
      Project   = "racing"
      ManagedBy = "terraform"
    }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project   = "racing"
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
