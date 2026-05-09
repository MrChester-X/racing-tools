data "aws_ssm_parameter" "github_token" {
  name            = var.github_token_ssm_name
  with_decryption = true
}

resource "aws_amplify_app" "front" {
  name        = "racing-front"
  repository  = "https://github.com/${var.github_owner}/${var.github_repo}"
  oauth_token = data.aws_ssm_parameter.github_token.value
  platform    = "WEB_COMPUTE"

  environment_variables = {
    AMPLIFY_MONOREPO_APP_ROOT = "apps/frontend"
    AMPLIFY_DIFF_DEPLOY       = "false"
    _CUSTOM_IMAGE             = "amplify:al2023"
  }

  lifecycle {
    ignore_changes = [
      # Amplify mutates this when builds run; don't fight it.
      environment_variables["WEB_COMPUTE_ENV_NAME"],
    ]
  }
}

resource "aws_amplify_branch" "main" {
  app_id            = aws_amplify_app.front.id
  branch_name       = var.github_branch
  framework         = "Next.js - SSR"
  stage             = "PRODUCTION"
  enable_auto_build = true

  environment_variables = {
    NEXT_PUBLIC_API_URL = "https://${var.api_subdomain}"
  }
}

resource "aws_amplify_domain_association" "racing" {
  app_id                = aws_amplify_app.front.id
  domain_name           = var.domain
  wait_for_verification = false

  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = ""
  }

  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = "www"
  }

  depends_on = [aws_acm_certificate_validation.amplify]
}
