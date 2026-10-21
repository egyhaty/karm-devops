variable "subscription_id" { type = string }
variable "location" {
  type    = string
  default = "westeurope"
}
variable "name" {
  type    = string
  default = "cloud-learning-azure"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{3,25}$", var.name))
    error_message = "Use a short lowercase lab name."
  }
}
variable "storage_account_name" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9]{3,24}$", var.storage_account_name))
    error_message = "Use a globally unique 3–24 character lowercase/digit name."
  }
}
variable "ssh_public_key_path" { type = string }
variable "vm_size" {
  type    = string
  default = "Standard_B2s"
}
variable "enable_probe" {
  type    = bool
  default = false
}

variable "app_client_cidrs" {
  type    = list(string)
  default = ["10.60.10.0/24"]
  validation {
    condition     = alltrue([for cidr in var.app_client_cidrs : can(cidrhost(cidr, 0)) && cidr != "0.0.0.0/0"])
    error_message = "Use explicit private lab client subnets, not the whole internet."
  }
}
