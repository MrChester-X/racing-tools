variable "primary_region" {
  description = "Main AWS region for all resources except CloudFront cert"
  type        = string
  default     = "eu-central-1"
}

variable "domain" {
  description = "Apex domain"
  type        = string
  default     = "acepace.ru"
}

variable "api_subdomain" {
  description = "Subdomain for the bot API (full FQDN)"
  type        = string
  default     = "api.acepace.ru"
}

variable "github_owner" {
  description = "GitHub repo owner"
  type        = string
}

variable "github_repo" {
  description = "GitHub repo name (the monorepo)"
  type        = string
}

variable "github_branch" {
  description = "Branch Amplify follows"
  type        = string
  default     = "main"
}

variable "github_token_ssm_name" {
  description = "SSM SecureString param holding GitHub PAT for Amplify"
  type        = string
  default     = "/racing/github-token"
}

variable "bot_image_tag" {
  description = "ECR image tag for the bot Lambda"
  type        = string
  default     = "latest"
}

variable "parser_image_tag" {
  description = "ECR image tag for the parser Fargate task"
  type        = string
  default     = "latest"
}

variable "renders_bucket_name" {
  description = "S3 bucket for Remotion renders. Defaults to racing-renders-<account>"
  type        = string
  default     = ""
}
