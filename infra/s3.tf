locals {
  renders_bucket_name = var.renders_bucket_name != "" ? var.renders_bucket_name : "racing-renders-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "renders" {
  bucket = local.renders_bucket_name
}

resource "aws_s3_bucket_public_access_block" "renders" {
  bucket                  = aws_s3_bucket.renders.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "renders" {
  bucket = aws_s3_bucket.renders.id

  rule {
    id     = "expire-old-renders"
    status = "Enabled"

    filter { prefix = "" }

    expiration { days = 30 }
  }
}
