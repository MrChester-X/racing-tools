###
# Default VPC + its subnets (the cheap path — no NAT Gateway).
###

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

###
# IAM
###

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: pull image, write logs, fetch SSM secrets at task start.
resource "aws_iam_role" "parser_exec" {
  name               = "racing-parser-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "parser_exec_basic" {
  role       = aws_iam_role.parser_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "parser_exec_ssm" {
  statement {
    actions = ["ssm:GetParameters"]
    resources = [
      "arn:aws:ssm:${var.primary_region}:${data.aws_caller_identity.current.account_id}:parameter/racing/*",
    ]
  }
}

resource "aws_iam_role_policy" "parser_exec_ssm" {
  name   = "racing-parser-exec-ssm"
  role   = aws_iam_role.parser_exec.id
  policy = data.aws_iam_policy_document.parser_exec_ssm.json
}

# Task role: app's own AWS calls (none currently — keep empty role for future use).
resource "aws_iam_role" "parser_task" {
  name               = "racing-parser-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

###
# Cluster, task, service
###

resource "aws_ecs_cluster" "parser" {
  name = "racing-parser"
}

resource "aws_ecs_cluster_capacity_providers" "parser" {
  cluster_name       = aws_ecs_cluster.parser.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }
}

resource "aws_cloudwatch_log_group" "parser" {
  name              = "/aws/ecs/racing-parser"
  retention_in_days = 14
}

locals {
  ssm_arn_prefix = "arn:aws:ssm:${var.primary_region}:${data.aws_caller_identity.current.account_id}:parameter"
}

resource "aws_ecs_task_definition" "parser" {
  family                   = "racing-parser"
  cpu                      = "256"
  memory                   = "512"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.parser_exec.arn
  task_role_arn            = aws_iam_role.parser_task.arn

  container_definitions = jsonencode([
    {
      name      = "parser"
      image     = "${aws_ecr_repository.parser.repository_url}:${var.parser_image_tag}"
      essential = true

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "DB_SSL", value = "true" },
      ]

      secrets = [
        { name = "DB_HOST", valueFrom = "${local.ssm_arn_prefix}/racing/db-host" },
        { name = "DB_PORT", valueFrom = "${local.ssm_arn_prefix}/racing/db-port" },
        { name = "DB_USERNAME", valueFrom = "${local.ssm_arn_prefix}/racing/db-user" },
        { name = "DB_PASSWORD", valueFrom = "${local.ssm_arn_prefix}/racing/db-password" },
        { name = "DB_DATABASE", valueFrom = "${local.ssm_arn_prefix}/racing/db-name" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.parser.name
          awslogs-region        = var.primary_region
          awslogs-stream-prefix = "parser"
        }
      }
    }
  ])

  lifecycle {
    # Image is updated by CI via new task-def revision + service redeploy.
    ignore_changes = [container_definitions]
  }
}

resource "aws_security_group" "parser" {
  name        = "racing-parser"
  description = "Outbound-only for parser Fargate task"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_ecs_service" "parser" {
  name            = "racing-parser"
  cluster         = aws_ecs_cluster.parser.id
  task_definition = aws_ecs_task_definition.parser.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.parser.id]
    assign_public_ip = true
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  lifecycle {
    ignore_changes = [task_definition]
  }
}
