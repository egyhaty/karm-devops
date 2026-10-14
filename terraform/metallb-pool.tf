resource "kubernetes_manifest" "traefik_pool" {
  manifest = yamldecode(file("${path.module}/../networking/metallb/address-pool.yaml"))

  depends_on = [helm_release.metallb]
}
