terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0, < 7.0"
    }
  }
}
variable "name" { type = string }
data "aws_availability_zones" "available" { state = "available" }
locals { azs = slice(data.aws_availability_zones.available.names, 0, 2) }
resource "aws_vpc" "lab" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = var.name }
}
resource "aws_internet_gateway" "lab" { vpc_id = aws_vpc.lab.id }
resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.lab.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet("10.42.0.0/16", 8, count.index)
  tags              = { Name = "${var.name}-public-${count.index}" }
}
resource "aws_subnet" "app" {
  count             = 2
  vpc_id            = aws_vpc.lab.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet("10.42.0.0/16", 8, 10 + count.index)
  tags              = { Name = "${var.name}-app-${count.index}" }
}
resource "aws_subnet" "database" {
  count             = 2
  vpc_id            = aws_vpc.lab.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet("10.42.0.0/16", 8, 20 + count.index)
  tags              = { Name = "${var.name}-db-${count.index}" }
}
resource "aws_route_table" "public" { vpc_id = aws_vpc.lab.id }
resource "aws_route" "internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.lab.id
}
resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}
resource "aws_eip" "nat" {
  count  = 2
  domain = "vpc"
}
resource "aws_nat_gateway" "lab" {
  count         = 2
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  depends_on    = [aws_internet_gateway.lab]
}
resource "aws_route_table" "app" {
  count  = 2
  vpc_id = aws_vpc.lab.id
}
resource "aws_route" "egress" {
  count                  = 2
  route_table_id         = aws_route_table.app[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.lab[count.index].id
}
resource "aws_route_table_association" "app" {
  count          = 2
  subnet_id      = aws_subnet.app[count.index].id
  route_table_id = aws_route_table.app[count.index].id
}
resource "aws_route_table" "database" { vpc_id = aws_vpc.lab.id }
resource "aws_route_table_association" "database" {
  count          = 2
  subnet_id      = aws_subnet.database[count.index].id
  route_table_id = aws_route_table.database.id
}
output "vpc_id" { value = aws_vpc.lab.id }
output "public_subnets" { value = aws_subnet.public[*].id }
output "app_subnets" { value = aws_subnet.app[*].id }
output "database_subnets" { value = aws_subnet.database[*].id }
