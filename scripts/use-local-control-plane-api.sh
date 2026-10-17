#!/usr/bin/env bash
# For these combined control-plane/worker nodes only, avoid ingress bootstrap cycles.
set -euo pipefail
: "${NODE_IP:?Set NODE_IP to the local control-plane address}"
[[ $EUID -eq 0 ]] || { echo 'Run as root' >&2; exit 1; }
test -f /etc/kubernetes/manifests/kube-apiserver.yaml
kubeconfig=/etc/kubernetes/kubelet.conf
test -f "$kubeconfig"
cluster_name=$(kubectl config view --raw --kubeconfig "$kubeconfig" -o jsonpath='{.clusters[0].name}')
[[ -n "$cluster_name" ]] || { echo 'No cluster entry found in kubelet.conf' >&2; exit 1; }
current_server=$(kubectl config view --raw --kubeconfig "$kubeconfig" -o jsonpath='{.clusters[0].cluster.server}')
desired_server="https://${NODE_IP}:6443"
if [[ "$current_server" == "$desired_server" ]]; then
  echo "Kubelet already uses $desired_server"
  exit 0
fi
backup="$kubeconfig.before-local-api.$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "$kubeconfig" "$backup"
kubectl config set-cluster "$cluster_name" --server="$desired_server" --kubeconfig="$kubeconfig" >/dev/null
chmod 600 "$kubeconfig"
systemctl restart kubelet
echo "Kubelet now uses $desired_server; previous config saved to $backup"
