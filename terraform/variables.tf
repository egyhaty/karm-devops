variable "kubeconfig_path" {
  type        = string
  description = "Path to kubeconfig file"
  default     = "~/.kube/config"
}

variable "letsencrypt_email" {
  type        = string
  description = "Email for Let's Encrypt registration"
}