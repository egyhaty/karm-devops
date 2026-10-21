module "network" {
  source = "./modules/network"
  name   = var.name
}
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-2023*-x86_64"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}
resource "aws_security_group" "alb" {
  name_prefix = "${var.name}-alb-"
  vpc_id      = module.network.vpc_id
}
resource "aws_security_group" "app" {
  name_prefix = "${var.name}-app-"
  vpc_id      = module.network.vpc_id
}
resource "aws_security_group" "db" {
  name_prefix = "${var.name}-db-"
  vpc_id      = module.network.vpc_id
}
resource "aws_security_group" "efs" {
  name_prefix = "${var.name}-efs-"
  vpc_id      = module.network.vpc_id
}
resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = var.client_cidr
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}
resource "aws_vpc_security_group_ingress_rule" "redirect" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = var.client_cidr
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}
resource "aws_vpc_security_group_ingress_rule" "app" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
}
resource "aws_vpc_security_group_egress_rule" "alb" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
}
resource "aws_vpc_security_group_ingress_rule" "db" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 3306
  to_port                      = 3306
}
resource "aws_vpc_security_group_egress_rule" "db" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.db.id
  ip_protocol                  = "tcp"
  from_port                    = 3306
  to_port                      = 3306
}
resource "aws_vpc_security_group_ingress_rule" "efs" {
  security_group_id            = aws_security_group.efs.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 2049
  to_port                      = 2049
}
resource "aws_vpc_security_group_egress_rule" "efs" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.efs.id
  ip_protocol                  = "tcp"
  from_port                    = 2049
  to_port                      = 2049
}
# HTTPS-only runtime egress through NAT is needed for reviewed WordPress packages,
# AWS APIs and SSM. Dynamic vendor endpoints cannot be represented by fixed CIDRs.
# No inbound access is granted; production can use baked images/proxies/endpoints.
#trivy:ignore:AVD-AWS-0104
resource "aws_vpc_security_group_egress_rule" "bootstrap" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}
resource "aws_db_subnet_group" "lab" {
  name       = var.name
  subnet_ids = module.network.database_subnets
}
resource "aws_db_instance" "wordpress" {
  identifier                  = var.name
  engine                      = "mysql"
  instance_class              = "db.t3.small"
  allocated_storage           = 20
  max_allocated_storage       = 30
  db_name                     = "wordpress"
  username                    = "wpadmin"
  manage_master_user_password = true
  storage_encrypted           = true
  multi_az                    = true
  publicly_accessible         = false
  db_subnet_group_name        = aws_db_subnet_group.lab.name
  vpc_security_group_ids      = [aws_security_group.db.id]
  backup_retention_period     = 7
  auto_minor_version_upgrade  = true
  deletion_protection         = false # Ephemeral lab only: enable for real environments.
  skip_final_snapshot         = true  # Destructive lab cleanup; not a production backup strategy.
  apply_immediately           = false
}
resource "aws_efs_file_system" "wordpress" {
  encrypted = true
  tags      = { Name = var.name }
}
resource "aws_efs_mount_target" "app" {
  count           = 2
  file_system_id  = aws_efs_file_system.wordpress.id
  subnet_id       = module.network.app_subnets[count.index]
  security_groups = [aws_security_group.efs.id]
}
resource "aws_iam_role" "app" {
  name = "${var.name}-instance"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole"
  }] })
}
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
resource "aws_iam_role_policy" "secret" {
  role = aws_iam_role.app.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Action = "secretsmanager:GetSecretValue", Resource = aws_db_instance.wordpress.master_user_secret[0].secret_arn
  }] })
}
resource "aws_iam_instance_profile" "app" {
  name = "${var.name}-instance"
  role = aws_iam_role.app.name
}
# Public HTTPS ingress is the lesson's entry point, restricted by client_cidr.
# It is intentional; the application and database remain private.
#trivy:ignore:AVD-AWS-0053
resource "aws_lb" "app" {
  name                       = var.name
  drop_invalid_header_fields = true
  load_balancer_type         = "application"
  internal                   = false
  subnets                    = module.network.public_subnets
  security_groups            = [aws_security_group.alb.id]
}
resource "aws_lb_target_group" "app" {
  name     = var.name
  port     = 80
  protocol = "HTTP"
  vpc_id   = module.network.vpc_id
  health_check {
    path                = "/healthz.php"
    matcher             = "200"
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}
resource "aws_lb_listener" "redirect" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}
resource "aws_launch_template" "app" {
  name_prefix            = "${var.name}-"
  image_id               = data.aws_ami.al2023.id
  instance_type          = "t3.small"
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile { name = aws_iam_instance_profile.app.name }
  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }
  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 12
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }
  user_data = base64encode(templatefile("${path.module}/user-data.sh.tftpl", {
    efs_id            = aws_efs_file_system.wordpress.id, region = var.region,
    secret_arn        = aws_db_instance.wordpress.master_user_secret[0].secret_arn,
    db_host           = aws_db_instance.wordpress.address, site_hostname = var.site_hostname,
    wordpress_version = var.wordpress_version, wordpress_sha256 = var.wordpress_sha256
  }))
}
resource "aws_autoscaling_group" "app" {
  name                      = var.name
  min_size                  = 2
  max_size                  = 4
  desired_capacity          = 2
  vpc_zone_identifier       = module.network.app_subnets
  target_group_arns         = [aws_lb_target_group.app.arn]
  health_check_type         = "ELB"
  health_check_grace_period = 900
  launch_template {
    id      = aws_launch_template.app.id
    version = aws_launch_template.app.latest_version
  }
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 100
      max_healthy_percentage = 150
      instance_warmup        = 300
    }
  }
  tag {
    key                 = "Name"
    value               = var.name
    propagate_at_launch = true
  }
  depends_on = [module.network, aws_efs_mount_target.app, aws_iam_role_policy.secret, aws_iam_role_policy_attachment.ssm, aws_lb_listener.https]
}
resource "aws_autoscaling_policy" "cpu" {
  name                   = "${var.name}-cpu"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"
  target_tracking_configuration {
    predefined_metric_specification { predefined_metric_type = "ASGAverageCPUUtilization" }
    target_value = 60
  }
}
resource "aws_cloudwatch_metric_alarm" "unhealthy" {
  alarm_name          = "${var.name}-unhealthy-target"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "missing"
  dimensions = {
    LoadBalancer = aws_lb.app.arn_suffix
    TargetGroup  = aws_lb_target_group.app.arn_suffix
  }
}
output "alb_dns_name" { value = aws_lb.app.dns_name }
output "site_hostname" { value = var.site_hostname }
output "target_group_arn" { value = aws_lb_target_group.app.arn }
output "asg_name" { value = aws_autoscaling_group.app.name }
output "db_identifier" { value = aws_db_instance.wordpress.identifier }
output "db_secret_arn" { value = aws_db_instance.wordpress.master_user_secret[0].secret_arn }
output "vpc_id" { value = module.network.vpc_id }
