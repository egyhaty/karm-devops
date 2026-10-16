#!/usr/bin/env bash
# Export the CRD schema omitted from the standard kubeconform registry.
set -euo pipefail
[[ "$#" == 2 ]] || { echo "Usage: $0 KUBERNETES_OPENAPI_JSON OUTPUT_DIR" >&2; exit 2; }
source=$1
destination=$2
name=io.k8s.apiextensions-apiserver.pkg.apis.apiextensions.v1.CustomResourceDefinition
mkdir -p "$destination/apiextensions.k8s.io"
jq -e --arg name "$name" '.definitions[$name]' "$source" >/dev/null || { echo "Missing Kubernetes CRD schema: $name" >&2; exit 1; }
jq --arg name "$name" '.definitions[$name] + {definitions: .definitions}' "$source" \
  > "$destination/apiextensions.k8s.io/customresourcedefinition_v1.json"
