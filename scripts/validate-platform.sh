#!/usr/bin/env bash
# Validate source YAML, topology, addressing, and workload availability.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
command -v yq >/dev/null || { echo "Install mikefarah/yq v4" >&2; exit 1; }
command -v jq >/dev/null || { echo "Install jq" >&2; exit 1; }

fail() { printf 'Validation failed: %s\n' "$*" >&2; exit 1; }
require() {
  local file=$1 expression=$2 message=$3
  yq -e "$expression" "$file" >/dev/null || fail "$message"
}
unique_values() {
  local label=$1; shift
  local count
  count=$(printf '%s\n' "$@" | LC_ALL=C sort -u | wc -l | tr -d ' ')
  [[ "$count" -eq "$#" ]] || fail "$label must be unique"
}
ipv4_to_int() {
  local a b c d
  IFS=. read -r a b c d <<< "$1"
  [[ "$a" =~ ^[0-9]+$ && "$b" =~ ^[0-9]+$ && "$c" =~ ^[0-9]+$ && "$d" =~ ^[0-9]+$ ]] || fail "Invalid IPv4: $1"
  ((a <= 255 && b <= 255 && c <= 255 && d <= 255)) || fail "Invalid IPv4: $1"
  printf '%u\n' "$(((a << 24) | (b << 16) | (c << 8) | d))"
}
cidr_bounds() {
  local cidr=$1 address=${1%/*} prefix=${1#*/}
  [[ "$prefix" =~ ^[0-9]+$ ]] && ((prefix <= 32)) || fail "Invalid IPv4 CIDR: $cidr"
  local value mask start end
  value=$(ipv4_to_int "$address")
  if ((prefix == 0)); then mask=0; else mask=$(((0xffffffff << (32 - prefix)) & 0xffffffff)); fi
  start=$((value & mask)); end=$((start | (0xffffffff ^ mask)))
  printf '%s %s\n' "$start" "$end"
}
cidr_overlaps() {
  local a_start a_end b_start b_end
  read -r a_start a_end <<< "$(cidr_bounds "$1")"
  read -r b_start b_end <<< "$(cidr_bounds "$2")"
  ((a_start <= b_end && b_start <= a_end))
}
ip_in_cidr() {
  local start end value
  read -r start end <<< "$(cidr_bounds "$2")"
  value=$(ipv4_to_int "$1")
  ((value >= start && value <= end))
}

mapfile -t yaml_files < <(git ls-files '*.yaml' '*.yml' | grep -vE '(^|/)(vendor|rendered|templates)/' || true)
[[ ${#yaml_files[@]} -gt 0 ]] || fail "No source YAML files found"
for file in "${yaml_files[@]}"; do yq eval-all '.' "$file" >/dev/null || fail "Invalid YAML: $file"; done

inventory=infrastructure/nodes.yaml
cilium_file=networking/cilium/values.yaml
traefik_file=traefik/values.yaml
version=$(yq -r '.cluster.kubernetesVersion' "$inventory")
[[ "$version" =~ ^v1\.[0-9]+\.[0-9]+$ ]] || fail "Pin a full Kubernetes version"
require "$inventory" '.cluster.ciliumVersion != ""' "Pin the Cilium version"
require "$inventory" '.nodes | length >= 3' "At least three nodes are required"
require "$inventory" '[.nodes[] | select(.roles | contains(["control-plane"]))] | length >= 3' "Three control-plane nodes are required"
require "$cilium_file" '.extraEnv[0].valueFrom.fieldRef.fieldPath == "status.hostIP"' "Cilium must use the local node API address"
require "$cilium_file" '.policyEnforcementMode == "default"' "Cilium policy enforcement must be enabled"
require "$cilium_file" '.cni.customConf == false' "CNI migration mode cannot be published as final"
require "$traefik_file" '.deployment.replicas >= 3' "Traefik needs at least three replicas"
require "$traefik_file" '.ports.kubeapi.exposedPort == 6443' "Expose Kubernetes API on 6443"
require "$traefik_file" '.providers.file.content.tcp.routers."kubernetes-api".tls.passthrough == true' "Kubernetes API TLS must pass through"
require "$traefik_file" '.providers.file.content.tcp.services."kubernetes-api".loadBalancer.healthCheck.interval == "2s"' "Kubernetes API backends need health checks"

mapfile -t node_names < <(yq -r '.nodes[].name' "$inventory")
mapfile -t node_addresses < <(yq -r '.nodes[].address' "$inventory")
mapfile -t vmids < <(yq -r '.nodes[].vmid' "$inventory")
unique_values "Node names" "${node_names[@]}"
unique_values "Node addresses" "${node_addresses[@]}"
unique_values "VM IDs" "${vmids[@]}"

vip=$(yq -r '.cluster.ingressAddress' "$inventory")
api_endpoint=$(yq -r '.cluster.apiEndpoint' "$inventory")
[[ "$api_endpoint" == "https://$vip:6443" ]] || fail "API endpoint must use the shared ingress address"
for address in "${node_addresses[@]}"; do [[ "$address" != "$vip" ]] || fail "Ingress address cannot also be a node address"; done

pod_cidr=$(yq -r '.ipam.operator.clusterPoolIPv4PodCIDRList[0]' "$cilium_file")
service_cidr=$(yq -r '.cluster.serviceCIDR' "$inventory")
cidr_overlaps "$pod_cidr" "$service_cidr" && fail "Cilium pod CIDR overlaps the service CIDR"
for address in "${node_addresses[@]}"; do ip_in_cidr "$address" "$pod_cidr" && fail "Node address $address is inside the pod CIDR"; done

mapfile -t pool_addresses < <(yq -r '.spec.addresses[]' networking/metallb/address-pool.yaml)
[[ "${pool_addresses[*]}" == "$vip/32" ]] || fail "MetalLB must advertise only the shared ingress address"
[[ "$(yq -r '.service.annotations."metallb.io/loadBalancerIPs"' "$traefik_file")" == "$vip" ]] || fail "Traefik must use the shared ingress address"
mapfile -t expected_api_servers < <(
  for index in "${!node_names[@]}"; do
    roles=$(yq -r ".nodes[$index].roles[]" "$inventory")
    if grep -qx 'control-plane' <<< "$roles"; then printf '%s:6443\n' "$(yq -r ".nodes[$index].address" "$inventory")"; fi
  done | LC_ALL=C sort
)
mapfile -t actual_api_servers < <(yq -r '.providers.file.content.tcp.services."kubernetes-api".loadBalancer.servers[].address' "$traefik_file" | LC_ALL=C sort)
diff -u <(printf '%s\n' "${expected_api_servers[@]}") <(printf '%s\n' "${actual_api_servers[@]}") || fail "Traefik API backends must match all control-plane nodes"

monitoring_values=$(mktemp)
trap 'rm -f "$monitoring_values"' EXIT
yq -r '.spec.source.helm.values' argocd/apps/monitoring.yaml > "$monitoring_values"
require "$monitoring_values" '.grafana.persistence.enabled == true' "Grafana persistence must be enabled"
require "$monitoring_values" '.grafana.persistence.storageClassName == "longhorn"' "Grafana must use Longhorn"
require "$monitoring_values" '.prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.storageClassName == "longhorn"' "Prometheus must use Longhorn"
require "$monitoring_values" '.prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage == "10Gi"' "Prometheus PVC must request 10Gi"
require "$monitoring_values" '.alertmanager.alertmanagerSpec.storage.volumeClaimTemplate.spec.storageClassName == "longhorn"' "Alertmanager must use Longhorn"
require "$monitoring_values" '.alertmanager.alertmanagerSpec.storage.volumeClaimTemplate.spec.resources.requests.storage == "2Gi"' "Alertmanager PVC must request 2Gi"

for app in golang nodejs; do
  if [[ "$app" == "golang" ]]; then values=charts/values-go.yaml; else values=charts/values-node.yaml; fi
  minimum=$(yq -r '.scaling.min' "$values"); maximum=$(yq -r '.scaling.max' "$values"); min_available=$(yq -r '.pdb.minAvailable' "$values")
  ((minimum >= 3 && maximum >= minimum)) || fail "$app scaling bounds are invalid"
  ((min_available >= 2 && min_available < minimum)) || fail "$app PDB would block voluntary maintenance"
  require "$values" '.topologySpreadConstraints[0].topologyKey == "kubernetes.io/hostname"' "$app must spread pods by hostname"
  require "$values" '.topologySpreadConstraints[0].maxSkew == 1' "$app pod spread maxSkew must be 1"
  mapfile -t rollout_keys < <(yq -r '.topologySpreadConstraints[0].matchLabelKeys[]' "$values")
  [[ "${#rollout_keys[@]}" -eq 1 && "${rollout_keys[0]}" == "pod-template-hash" ]] || fail "$app must spread each rollout independently"
  [[ "$(yq -r '.topologySpreadConstraints[0].labelSelector.matchLabels."app.kubernetes.io/instance"' "$values")" == "$app" ]] || fail "$app topology selector does not match its release"
done
printf 'Parsed %s YAML files; topology, networking, storage, and availability checks passed\n' "${#yaml_files[@]}"
