resource "helm_release" "cilium" {
  name       = "cilium"
  namespace  = "kube-system"
  repository = "https://helm.cilium.io"
  chart      = "cilium"
  version    = "1.18.14"

  values  = [file("${path.module}/../networking/cilium/values.yaml")]
  wait    = true
  timeout = 600

  lifecycle {
    prevent_destroy = true
  }
}
