#!/usr/bin/env bash
# Export OpenAPI schemas from pinned upstream Helm CRDs.
set -euo pipefail
[[ "$#" -ge 2 ]] || { echo "Usage: $0 OUTPUT_DIR CRD_YAML..." >&2; exit 2; }
destination=$1
shift
command -v yq >/dev/null
command -v jq >/dev/null
mkdir -p "$destination"
count=0
for source in "$@"; do
  while IFS= read -r crd; do
    [[ -n "$crd" ]] || continue
    group=$(jq -r '.spec.group' <<< "$crd")
    kind=$(jq -r '.spec.names.kind' <<< "$crd")
    while IFS= read -r version; do
      [[ -n "$version" ]] || continue
      version_name=$(jq -r '.name' <<< "$version")
      target="$destination/$group"
      mkdir -p "$target"
      jq -c '.schema.openAPIV3Schema' <<< "$version" > "$target/${kind,,}_${version_name}.json"
      ((count += 1))
    done < <(jq -c '.spec.versions[] | select(.schema.openAPIV3Schema != null)' <<< "$crd")
  done < <(yq eval-all -o=json -I=0 'select(.kind == "CustomResourceDefinition")' "$source")
done
((count > 0)) || { echo "No upstream CRD schemas were exported" >&2; exit 1; }
printf 'Exported %s upstream CRD schemas\n' "$count"
