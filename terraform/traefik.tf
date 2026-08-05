resource "kubernetes_namespace" "traefik" {
  metadata {
    name = "traefik"
  }
}

resource "helm_release" "traefik" {
  name       = "traefik"
  repository = "https://traefik.github.io/charts"
  chart      = "traefik"
  namespace  = kubernetes_namespace.traefik.metadata[0].name

  values = [yamlencode({
    additionalArguments = [
      "--api.dashboard=true",
      "--entrypoints.web.address=:80",
      "--entrypoints.websecure.address=:443",
      "--providers.kubernetesingress=true",
      "--providers.kubernetescrd=true"
    ]
    ports = {
      web = {
        port   = 80
        expose = { default = true }
      }
      websecure = {
        port   = 443
        expose = { default = true }
      }
    }
  })]
}