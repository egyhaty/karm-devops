# Mock provider: no AWS credentials, API calls or paid resources.
mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = { names = ["eu-west-1a", "eu-west-1b"] }
  }
  mock_data "aws_ami" {
    defaults = { id = "ami-00000000000000000" }
  }
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws:elasticloadbalancing:eu-west-1:123456789012:loadbalancer/app/test/0000000000000000" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:eu-west-1:123456789012:targetgroup/test/0000000000000000" }
  }
  mock_resource "aws_launch_template" {
    defaults = { id = "lt-00000000000000000" }
  }
  mock_resource "aws_db_instance" {
    defaults = {
      master_user_secret = [{
        secret_arn    = "arn:aws:secretsmanager:eu-west-1:123456789012:secret:cloud-learning-test"
        kms_key_id    = "test-key"
        secret_status = "active"
      }]
    }
  }
}
variables {
  certificate_arn   = "arn:aws:acm:eu-west-1:123456789012:certificate/00000000-0000-0000-0000-000000000000"
  site_hostname     = "wp-lab.example.invalid"
  client_cidr       = "192.0.2.1/32"
  wordpress_version = "6.0.0"
  wordpress_sha256  = "0000000000000000000000000000000000000000000000000000000000000000"
}
run "private_ha_architecture" {
  command = apply # Mocked in memory; no cloud resources or API calls.
  assert {
    condition     = aws_db_instance.wordpress.multi_az && !aws_db_instance.wordpress.publicly_accessible && aws_db_instance.wordpress.storage_encrypted
    error_message = "RDS must remain private, encrypted and Multi-AZ."
  }
  assert {
    condition     = aws_autoscaling_group.app.min_size == 2 && length(aws_autoscaling_group.app.vpc_zone_identifier) == 2
    error_message = "The app must span two private subnets with at least two instances."
  }
  assert {
    condition     = aws_launch_template.app.metadata_options[0].http_tokens == "required"
    error_message = "IMDSv2 must be required."
  }
  assert {
    condition     = aws_vpc_security_group_ingress_rule.https.cidr_ipv4 == "192.0.2.1/32"
    error_message = "Installer ingress must remain limited to the trusted test client."
  }
}
