resource "helm_release" "traefik" {
  name             = "traefik"
  namespace        = "traefik"
  create_namespace = true
  repository       = "https://traefik.github.io/charts"
  chart            = "traefik"
  version          = "41.1.1"

  depends_on = [helm_release.metallb]
  values     = [file("${path.module}/../traefik/values.yaml")]
  wait       = true
  timeout    = 300
}
