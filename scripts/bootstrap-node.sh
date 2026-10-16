#!/usr/bin/env bash
# Run as root inside a fresh Ubuntu 24.04 VM. Joining uses a separate, short-lived token.
set -euo pipefail
: "${NODE_IP:?Set NODE_IP to the address assigned to this node}"
KUBERNETES_PACKAGE_VERSION="${KUBERNETES_PACKAGE_VERSION:-1.36.5-1.1}"
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y qemu-guest-agent containerd ca-certificates curl gpg conntrack socat
systemctl start qemu-guest-agent
swapoff -a
sed -i '/\sswap\s/s/^/#/' /etc/fstab
printf 'overlay\nbr_netfilter\n' > /etc/modules-load.d/kubernetes.conf
modprobe overlay
modprobe br_netfilter
cat > /etc/sysctl.d/99-kubernetes.conf <<'EOF'
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward = 1
EOF
sysctl --system >/dev/null
mkdir -p /etc/containerd
containerd config default > /etc/containerd/config.toml
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
systemctl enable --now containerd
systemctl restart containerd
install -d -m 755 /etc/apt/keyrings
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.36/deb/Release.key |
  gpg --dearmor --yes -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
printf 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.33/deb/ /\n' > /etc/apt/sources.list.d/kubernetes.list
apt-get update -qq
apt-get install -y "kubelet=${KUBERNETES_PACKAGE_VERSION}" "kubeadm=${KUBERNETES_PACKAGE_VERSION}" "kubectl=${KUBERNETES_PACKAGE_VERSION}"
apt-mark hold kubelet kubeadm kubectl
printf 'KUBELET_EXTRA_ARGS=--node-ip=%s\n' "$NODE_IP" > /etc/default/kubelet
systemctl enable kubelet
