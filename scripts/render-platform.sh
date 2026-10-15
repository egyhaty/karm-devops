#!/usr/bin/env bash
# Requires Helm, kubectl, and Python with PyYAML. Does not access a live cluster.
set -euo pipefail
mkdir -p rendered rendered/crds schemas
KUBERNETES_VERSION="$(python3 - <<'PY'
import yaml

with open("infrastructure/nodes.yaml", encoding="utf-8") as source:
    version = yaml.safe_load(source)["cluster"]["kubernetesVersion"]
print(version.removeprefix("v"))
PY
)"
CILIUM_VERSION="$(python3 - <<'PY'
import yaml

with open("infrastructure/nodes.yaml", encoding="utf-8") as source:
    print(yaml.safe_load(source)["cluster"]["ciliumVersion"])
PY
)"
helm lint charts -f charts/values-go.yaml
helm lint charts -f charts/values-node.yaml
helm template golang charts -f charts/values-go.yaml > rendered/golang.yaml
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
helm template longhorn longhorn/longhorn --version 1.10.2 --namespace longhorn-system --kube-version "$KUBERNETES_VERSION" --include-crds -f storage/longhorn/values.yaml > rendered/longhorn.yaml
kubectl kustomize argocd/ha > rendered/argocd-ha.yaml
helm show crds prometheus-community/kube-prometheus-stack --version 87.4.0 > rendered/crds/prometheus.yaml
python3 - <<'PY'
import pathlib
import yaml

app = yaml.safe_load(pathlib.Path("argocd/apps/monitoring.yaml").read_text())
pathlib.Path("/tmp/kube-prometheus-stack-values.yaml").write_text(
    app["spec"]["source"]["helm"]["values"], encoding="utf-8"
)
PY
helm template monitoring prometheus-community/kube-prometheus-stack --version 87.4.0 --namespace monitoring --include-crds -f /tmp/kube-prometheus-stack-values.yaml > rendered/monitoring.yaml
helm template cert-manager jetstack/cert-manager --version v1.21.1 --namespace cert-manager --set crds.enabled=true --include-crds > rendered/crds/cert-manager.yaml
helm template metallb metallb/metallb --version 0.16.1 --namespace metallb-system --include-crds > rendered/crds/metallb.yaml
helm show crds sealed-secrets/sealed-secrets --version 2.17.3 > rendered/crds/sealed-secrets.yaml
python3 scripts/export-crd-schemas.py schemas rendered/*.yaml rendered/crds/*.yaml
curl -fsSL "https://raw.githubusercontent.com/kubernetes/kubernetes/v${KUBERNETES_VERSION}/api/openapi-spec/swagger.json" -o schemas/kubernetes-openapi.json
python3 scripts/export-kubernetes-schema.py schemas/kubernetes-openapi.json schemas
