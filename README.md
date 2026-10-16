# Karem On-Prem DevOps Platform

[![Platform Validation](https://github.com/egyhaty/karm-devops/actions/workflows/platform-validation.yml/badge.svg)](https://github.com/egyhaty/karm-devops/actions/workflows/platform-validation.yml)

Three-node Kubernetes platform with GitOps delivery, Cilium networking, TLS ingress, and observability. The node inventory and pinned versions are in [infrastructure/nodes.yaml](infrastructure/nodes.yaml).

## Cluster

| Node | Address | Roles |
| --- | --- | --- |
| devops | 66.11.126.178 | Control plane, worker |
| devops-worker-prox4 | 66.11.126.181 | Control plane, worker |
| devops-control-prox4 | 66.11.126.182 | Control plane, worker |

The shared ingress address is **66.11.126.179**. Kubernetes API clients use `https://66.11.126.179:6443`. Node addresses are distinct from the shared service address. The former node and ingress addresses are no longer assigned to this platform.

Kubernetes v1.32.13 uses three stacked etcd members. Cilium 1.19.9 replaces Flannel, with cluster-pool IPAM `10.245.0.0/16`, VXLAN port 8473, and kube-proxy retained. Cilium and kubelets bootstrap through their local control-plane API to avoid depending on ingress before networking is ready. See [architecture](docs/architecture.md).

## Components and ownership

| Component | Configuration | Owner |
| --- | --- | --- |
| Cilium | networking/cilium/values.yaml | Terraform Helm release |
| MetalLB allocation | networking/metallb/address-pool.yaml | Terraform |
| Traefik: three replicas, API health checks | traefik/values.yaml | Terraform Helm release |
| Argo CD HA profile | argocd/ha/ | Argo CD application |
| Go and Node.js workloads | charts/ | Argo CD |
| Application network policies | networking/policies/ | Argo CD |
| Monitoring and certificates | monitoring/, cert-manager/ | Argo CD |
| Persistent volumes | storage/longhorn/ | Argo CD; three-way replicated across Kubernetes nodes |

Argo CD uses two server replicas, two repository servers, and three Redis HA instances with three HAProxy instances. Its upstream HA profile retains single controller, Dex, ApplicationSet and notification replicas. Runtime authentication secrets are excluded from the HA installation manifests.

## Access

- [Argo CD](https://argocd.murabba.net/)
- [Grafana](https://grafana.murabba.net/)
- [Prometheus](https://prometheus.murabba.net/) — protected by Basic Auth.
- [Go application](https://go.murabba.net/)
- [Node.js application](https://node.murabba.net/)

Passwords, kubeconfigs, join tokens and private keys must remain outside Git. Hubble is enabled internally; use an authenticated port-forward for access.

## Delivery and validation

GitHub Actions builds images, tests their health, version and metrics endpoints, then publishes the tested images. Updating application image values creates a Git commit. Argo CD reconciles those values into deployments. Platform validation checks Terraform, both application Helm value sets, YAML, inventory consistency, rendered Kubernetes schemas, shell syntax, and secrets.

```bash
python3 -m pip install PyYAML yamllint
python3 scripts/validate-platform.py
helm lint charts -f charts/values-go.yaml
helm lint charts -f charts/values-node.yaml
bash -n scripts/*.sh
bash scripts/render-platform.sh
terraform -chdir=terraform init -backend=false
terraform -chdir=terraform fmt -check -recursive
terraform -chdir=terraform validate
```

Rendering requires Helm 3, kubectl, Python with PyYAML, curl and internet access. CI derives the Kubernetes schema version from `infrastructure/nodes.yaml`, renders the monitoring Helm chart using the values embedded in its Argo CD Application, and validates resources against pinned upstream CRDs. It does not require cluster credentials.

## Operating the platform

Read [operations](docs/operations.md) before applying infrastructure changes. Existing live releases must be imported into Terraform state before planning; a fresh state does not describe an existing cluster. `scripts/bootstrap-node.sh` prepares a fresh Ubuntu node; it does not allocate addresses, install the control plane, or publish join credentials.

Application replica minimums are three, with hostname spreading and disruption budgets preserving two replicas during voluntary maintenance. Traefik also has three replicas and a disruption budget. These settings protect against individual node disruption; shared infrastructure and persistent data require separate recovery arrangements.

## Current limits

Prometheus, Grafana and Alertmanager now store their current data on Longhorn PVCs (10Gi, 5Gi and 2Gi respectively), with three replicas across the Kubernetes nodes. The PVCs and Longhorn volumes are bound and healthy. Longhorn replication protects volume availability; a scheduled off-cluster backup is not configured.

Kubernetes upgrades are performed one minor version at a time. Current nodes run 1.32.13; additional minor updates require coordinating Cilium and Longhorn compatibility first. Etcd backups protect Kubernetes state, not application volume contents. Do not stop two etcd members together.

## Documentation

- [Architecture](docs/architecture.md)
- [Operations and migration](docs/operations.md)
- [شرح المشروع بالعربي](docs/platform-explained-ar.md)
- [Storage and recovery](docs/storage-and-recovery.md)

MIT License. Maintained by [@egyhaty](https://github.com/egyhaty).
