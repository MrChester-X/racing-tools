###
# IAM role for the bot Lambda
###

data "aws_iam_policy_document" "bot_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "bot" {
  name               = "racing-bot-lambda"
  assume_role_policy = data.aws_iam_policy_document.bot_assume.json
}

resource "aws_iam_role_policy_attachment" "bot_basic" {
  role       = aws_iam_role.bot.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "bot_inline" {
  statement {
    sid     = "RendersBucketRW"
    actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [
      aws_s3_bucket.renders.arn,
      "${aws_s3_bucket.renders.arn}/*",
    ]
  }

  statement {
    sid     = "ReadOwnSsm"
    actions = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = [
      "arn:aws:ssm:${var.primary_region}:${data.aws_caller_identity.current.account_id}:parameter/racing/*",
    ]
  }

  statement {
    sid     = "InvokeRemotionLambda"
    actions = ["lambda:InvokeFunction"]
    resources = [
      "arn:aws:lambda:${var.primary_region}:${data.aws_caller_identity.current.account_id}:function:remotion-render-*",
    ]
  }
}

resource "aws_iam_role_policy" "bot" {
  name   = "racing-bot-inline"
  role   = aws_iam_role.bot.id
  policy = data.aws_iam_policy_document.bot_inline.json
}

###
# Lambda (container image)
###

resource "aws_lambda_function" "bot" {
  function_name = "racing-bot"
  role          = aws_iam_role.bot.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.bot.repository_url}:${var.bot_image_tag}"

  architectures = ["x86_64"]
  memory_size   = 1024
  timeout       = 30

  environment {
    variables = {
      NODE_OPTIONS                        = "--enable-source-maps"
      S3_RENDERS_BUCKET                   = aws_s3_bucket.renders.bucket
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    }
  }

  lifecycle {
    # CI updates the image_uri out of band via `aws lambda update-function-code`.
    # Don't let `terraform apply` revert it.
    ignore_changes = [image_uri]
  }
}

###
# API Gateway HTTP API + custom domain api.acepace.ru
###

resource "aws_apigatewayv2_api" "bot" {
  name          = "racing-bot"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "bot" {
  api_id                 = aws_apigatewayv2_api.bot.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.bot.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "bot_webhook" {
  api_id    = aws_apigatewayv2_api.bot.id
  route_key = "POST /telegram/webhook"
  target    = "integrations/${aws_apigatewayv2_integration.bot.id}"
}

resource "aws_apigatewayv2_stage" "bot_default" {
  api_id      = aws_apigatewayv2_api.bot.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "bot_apigw" {
  statement_id  = "AllowAPIGwInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.bot.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.bot.execution_arn}/*/*"
}

resource "aws_apigatewayv2_domain_name" "bot" {
  domain_name = var.api_subdomain

  domain_name_configuration {
    certificate_arn = aws_acm_certificate.bot.arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  depends_on = [aws_acm_certificate_validation.bot]
}

resource "aws_apigatewayv2_api_mapping" "bot" {
  api_id      = aws_apigatewayv2_api.bot.id
  domain_name = aws_apigatewayv2_domain_name.bot.id
  stage       = aws_apigatewayv2_stage.bot_default.id
}

resource "aws_route53_record" "bot" {
  zone_id = aws_route53_zone.racing.zone_id
  name    = var.api_subdomain
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.bot.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.bot.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
