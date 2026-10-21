variable "region" {
  type    = string
  default = "eu-west-1"
}
variable "name" {
  type    = string
  default = "cloud-learning-wp"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{3,23}$", var.name))
    error_message = "Use 4–24 lowercase letters, digits and hyphens."
  }
}
variable "certificate_arn" {
  type = string
  validation {
    condition     = can(regex("^arn:aws:acm:", var.certificate_arn))
    error_message = "Supply an issued ACM certificate ARN in the selected region."
  }
}
variable "site_hostname" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]+[a-z0-9]$", var.site_hostname))
    error_message = "Supply a DNS hostname matching the certificate, without scheme/path."
  }
}
variable "wordpress_version" {
  type = string
  validation {
    condition     = can(regex("^[0-9]+\\.[0-9]+(\\.[0-9]+)?$", var.wordpress_version))
    error_message = "Supply a reviewed WordPress release version."
  }
}
variable "wordpress_sha256" {
  type = string
  validation {
    condition     = can(regex("^[a-f0-9]{64}$", var.wordpress_sha256))
    error_message = "Supply the verified SHA-256 for that release's official tar.gz."
  }
}
variable "client_cidr" {
  type = string
  validation {
    condition     = can(cidrnetmask(var.client_cidr)) && var.client_cidr != "0.0.0.0/0"
    error_message = "Use your trusted test-client IPv4 CIDR, not the whole internet."
  }
}
