output "name_servers" {
  description = "Set these as NS records at the registrar for var.domain"
  value       = aws_route53_zone.racing.name_servers
}

output "hosted_zone_id" {
  value = aws_route53_zone.racing.zone_id
}

output "amplify_app_id" {
  value = aws_amplify_app.front.id
}

output "amplify_default_domain" {
  value = aws_amplify_app.front.default_domain
}

output "bot_endpoint" {
  description = "Set this URL as Telegram webhook"
  value       = "https://${var.api_subdomain}/telegram/webhook"
}

output "bot_function_name" {
  value = aws_lambda_function.bot.function_name
}

output "parser_cluster_name" {
  value = aws_ecs_cluster.parser.name
}

output "parser_service_name" {
  value = aws_ecs_service.parser.name
}

output "ecr_bot_url" {
  value = aws_ecr_repository.bot.repository_url
}

output "ecr_parser_url" {
  value = aws_ecr_repository.parser.repository_url
}

output "github_actions_parser_role_arn" {
  description = "Role ARN that GitHub Actions assumes to deploy the parser"
  value       = aws_iam_role.github_actions_parser_deploy.arn
}

output "renders_bucket" {
  value = aws_s3_bucket.renders.bucket
}
