###
# DB credentials for the timing-parser ECS task.
#
# Created with placeholder "CHANGE_ME" values. Real values are set out-of-band
# (AWS console or `aws ssm put-parameter --overwrite`) and Terraform never
# touches them again — the lifecycle.ignore_changes on `value` keeps the
# managed resource without owning its content.
#
# Names match what parser.tf reads via secrets[].
###

locals {
  parser_db_ssm_params = {
    "db-host"     = { type = "String",       description = "Postgres host" }
    "db-port"     = { type = "String",       description = "Postgres port" }
    "db-user"     = { type = "String",       description = "Postgres user" }
    "db-password" = { type = "SecureString", description = "Postgres password" }
    "db-name"     = { type = "String",       description = "Postgres database name" }
  }
}

resource "aws_ssm_parameter" "parser_db" {
  for_each = local.parser_db_ssm_params

  name        = "/racing/${each.key}"
  type        = each.value.type
  value       = "CHANGE_ME"
  description = each.value.description

  lifecycle {
    ignore_changes = [value]
  }
}
