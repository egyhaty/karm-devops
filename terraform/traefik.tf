resource "helm_release" "traefik" {
  name             = "traefik"
  namespace        = "traefik"
  create_namespace = true

  repository = "https://traefik.github.io/charts"
  chart      = "traefik"
  version    = "41.1.1"

  depends_on = [
    helm_release.metallb
  ]

  wait    = true
  timeout = 300

  values = [
    yamlencode({
      additionalArguments = [
        "--api.dashboard=true",
        "--entrypoints.web.address=:8000",
        "--entrypoints.websecure.address=:8443",
        "--providers.kubernetesingress=true",
        "--providers.kubernetescrd=true"
      ]

      deployment = {
        kind     = "Deployment"
        replicas = 1
      }

      podSecurityContext = {
        fsGroup      = 65532
        runAsGroup   = 65532
        runAsNonRoot = true
        runAsUser    = 65532
      }

      securityContext = {
        allowPrivilegeEscalation = false
        capabilities = {
          drop = ["ALL"]
        }
        readOnlyRootFilesystem = true
      }

      ports = {
        web = {
          expose = {
            default = true
          }
          port = 8000
        }
        websecure = {
          expose = {
            default = true
          }
          port = 8443
        }
      }

      service = {
        type = "LoadBalancer"
      }
    })
  ]
}