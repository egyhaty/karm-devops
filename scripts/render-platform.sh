#!/usr/bin/env bash
# Requires Helm, kubectl, yq and jq. Does not access a live cluster.
set -euo pipefail
mkdir -p rendered rendered/crds schemas
KUBERNETES_VERSION="$(yq -r '.cluster.kubernetesVersion | sub("^v"; "")' infrastructure/nodes.yaml)"
CILIUM_VERSION="$(yq -r '.cluster.ciliumVersion' infrastructure/nodes.yaml)"
helm lint charts -f charts/values-node.yaml
helm lint golang/deploy/chart
helm template golang golang/deploy/chart --namespace learning-lab > rendered/golang.yaml
helm template nodejs charts -f charts/values-node.yaml > rendered/nodejs.yaml
helm repo add cilium https://helm.cilium.io --force-update
helm repo add traefik https://traefik.github.io/charts --force-update
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts --force-update
helm repo add jetstack https://charts.jetstack.io --force-update
helm repo add metallb https://metallb.github.io/metallb --force-update
helm repo add sealed-secrets https://bitnami.github.io/sealed-secrets --force-update
helm repo add longhorn https://charts.longhorn.io --force-update
helm repo update
helm template cilium cilium/cilium --version "$CILIUM_VERSION" --namespace kube-system --include-crds -f networking/cilium/values.yaml > rendered/cilium.yaml
helm template traefik traefik/traefik --version 41.1.1 --namespace traefik --kube-version "$KUBERNETES_VERSION" --api-versions policy/v1/PodDisruptionBudget --include-crds -f traefik/values.yaml > rendered/traefik.yaml
helm template longhorn longhorn/longhorn --version 1.13.0 --namespace longhorn-system --kube-version "$KUBERNETES_VERSION" --include-crds -f storage/longhorn/values.yaml > rendered/longhorn.yaml
kubectl kustomize argocd/ha > rendered/argocd-ha.yaml
helm show crds prometheus-community/kube-prometheus-stack --version 92.10.1 > rendered/crds/prometheus.yaml
yq -r '.spec.source.helm.values' argocd/apps/monitoring.yaml > /tmp/kube-prometheus-stack-values.yaml
helm template monitoring prometheus-community/kube-prometheus-stack --version 92.10.1 --namespace monitoring --include-crds -f /tmp/kube-prometheus-stack-values.yaml > rendered/monitoring.yaml
helm template cert-manager jetstack/cert-manager --version v1.21.1 --namespace cert-manager --set crds.enabled=true --include-crds > rendered/crds/cert-manager.yaml
helm template metallb metallb/metallb --version 0.16.1 --namespace metallb-system --include-crds > rendered/crds/metallb.yaml
helm show crds sealed-secrets/sealed-secrets --version 2.17.3 > rendered/crds/sealed-secrets.yaml
bash scripts/export-crd-schemas.sh schemas rendered/*.yaml rendered/crds/*.yaml
curl -fsSL "https://raw.githubusercontent.com/kubernetes/kubernetes/v${KUBERNETES_VERSION}/api/openapi-spec/swagger.json" -o schemas/kubernetes-openapi.json
bash scripts/export-kubernetes-schema.sh schemas/kubernetes-openapi.json schemas
