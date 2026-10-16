# Karem On-Prem DevOps Platform

[![Platform Validation](https://github.com/egyhaty/karm-devops/actions/workflows/platform-validation.yml/badge.svg)](https://github.com/egyhaty/karm-devops/actions/workflows/platform-validation.yml)
[![Post-deployment checks](https://github.com/egyhaty/karm-devops/actions/workflows/post-deployment-check.yml/badge.svg)](https://github.com/egyhaty/karm-devops/actions/workflows/post-deployment-check.yml)

A hands-on Kubernetes platform demonstrating infrastructure automation, GitOps, networking, persistent storage, observability and application delivery. Git is the source of truth for cluster configuration and application releases.

## Platform

| Layer | Implementation |
| --- | --- |
| Kubernetes | v1.36.5; three control-plane and worker VMs |
| Networking | Cilium 1.20.2, cluster-pool IPAM, VXLAN and NetworkPolicy |
| Ingress and API | MetalLB shared address, Traefik replicas and health-checked API routing |
| GitOps | Argo CD HA profile and app-of-apps |
| Persistent storage | Longhorn 1.13.0; three replicas per volume |
| Observability | Prometheus, Grafana, Alertmanager, node and Kubernetes metrics |
| Workloads | Go and Node.js applications deployed with Helm |
| Infrastructure | Terraform-managed Helm releases and adopted Terraform state |

The [node inventory](infrastructure/nodes.yaml) records the Kubernetes VM roles. The shared ingress/API address is a service address, not a node address. See [architecture](docs/architecture.md) for the delivery flow and [operations](docs/operations.md) for maintenance procedures.

## Delivery and verification

- GitHub Actions builds and smoke-tests Go and Node.js images, publishes commit-tagged images with signed build provenance, and promotes the tags through Helm values.
- Argo CD reconciles the promoted values and application manifests.
- Post-deployment checks verify the public application health and metrics routes. Authenticated Prometheus target checks are enabled by the `PROMETHEUS_BASIC_AUTH` GitHub Actions secret.
- Pull-request validation covers Terraform, Helm, YAML, Kubernetes schemas, shell syntax and secret scanning.

The architecture guide includes a traceable delivery example from source commit through image promotion and GitOps reconciliation. Verify published image provenance with `gh attestation verify oci://docker.io/egyhaty/golang@sha256:<digest> --repo egyhaty/karm-devops` (replace the digest with the published image digest).

## Storage and recovery

Longhorn replicates persistent volumes across Kubernetes nodes. A manually created encrypted migration archive was checksum-verified and stored off-cluster. Its contents and protected storage locations are not published here.

Longhorn 1.13 supports SMB/CIFS backup targets. The current Kubernetes cluster has no configured target or recurring jobs because the SMB endpoint, share name and credentials are not present in Longhorn. The default StorageClass also does not encrypt volumes; encrypted backups require encrypted volumes. The recovery policy is daily backups with seven-day retention and a restore drill to an isolated test volume. See [storage and recovery](docs/storage-and-recovery.md) for current status. Longhorn replicas are not a substitute for an off-cluster backup. Etcd snapshots protect Kubernetes state, not application volume contents.

## Access

- [Argo CD](https://argocd.murabba.net/)
- [Grafana](https://grafana.murabba.net/)
- [Prometheus](https://prometheus.murabba.net/) — Basic Auth is enabled.
- [Go application](https://go.murabba.net/)
- [Node.js application](https://node.murabba.net/)

Grafana redirects unauthenticated users to login. Prometheus returns HTTP 401 without Basic Auth; these are expected responses.

## Run the checks

```bash
bash scripts/validate-platform.sh
helm lint charts -f charts/values-go.yaml
helm lint charts -f charts/values-node.yaml
bash -n scripts/*.sh
bash scripts/render-platform.sh
terraform -chdir=terraform init -backend=false
terraform -chdir=terraform fmt -check -recursive
terraform -chdir=terraform validate
```

Install Bash, [yq](https://github.com/mikefarah/yq), jq, Helm 3, kubectl, Terraform and curl first. Rendering creates local files under `rendered/` and `schemas/`; it does not connect to the live cluster.

## Documentation

- [Architecture and delivery trace](docs/architecture.md)
- [Operations and migration](docs/operations.md)
- [شرح المشروع بالعربي](docs/platform-explained-ar.md)
- [Storage and recovery](docs/storage-and-recovery.md)

MIT License. Maintained by [@egyhaty](https://github.com/egyhaty).
