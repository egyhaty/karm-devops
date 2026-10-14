#!/usr/bin/env bash
# For these combined control-plane/worker nodes only, avoid ingress bootstrap cycles.
set -euo pipefail
: "${NODE_IP:?Set NODE_IP to the local control-plane address}"
test -f /etc/kubernetes/manifests/kube-apiserver.yaml
cp -p /etc/kubernetes/kubelet.conf /etc/kubernetes/kubelet.conf.before-local-api
python3 - "$NODE_IP" <<'PY'
import pathlib
import sys
import yaml

path = pathlib.Path('/etc/kubernetes/kubelet.conf')
config = yaml.safe_load(path.read_text())
for cluster in config['clusters']:
    cluster['cluster']['server'] = f'https://{sys.argv[1]}:6443'
path.write_text(yaml.safe_dump(config, sort_keys=False))
path.chmod(0o600)
PY
systemctl restart kubelet
