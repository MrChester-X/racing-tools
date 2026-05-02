###
# ACM certificate for the Amplify frontend.
# Must live in us-east-1 because Amplify routes through CloudFront.
###

resource "aws_acm_certificate" "amplify" {
  provider                  = aws.us_east_1
  domain_name               = var.domain
  subject_alternative_names = ["www.${var.domain}"]
  validation_method         = "DNS"

  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "amplify_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.amplify.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }

  zone_id = aws_route53_zone.racing.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "amplify" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.amplify.arn
  validation_record_fqdns = [for r in aws_route53_record.amplify_cert_validation : r.fqdn]
}

###
# ACM certificate for the bot API on api.acepace.ru.
# Lives in the primary region (regional API Gateway).
###

resource "aws_acm_certificate" "bot" {
  domain_name       = var.api_subdomain
  validation_method = "DNS"

  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "bot_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.bot.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }

  zone_id = aws_route53_zone.racing.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "bot" {
  certificate_arn         = aws_acm_certificate.bot.arn
  validation_record_fqdns = [for r in aws_route53_record.bot_cert_validation : r.fqdn]
}
