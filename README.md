# Karem On-Prem DevOps Platform

[![Platform Validation](https://github.com/egyhaty/karm-devops/actions/workflows/platform-validation.yml/badge.svg)](https://github.com/egyhaty/karm-devops/actions/workflows/platform-validation.yml)

A hands-on Kubernetes platform for demonstrating infrastructure automation, GitOps, networking, persistent storage, observability, and CI/CD. Git is the source of truth for the declared cluster configuration and application releases.

## Current platform

| Layer | Implementation |
| --- | --- |
| Kubernetes | v1.36.5; three stacked control-plane and worker VMs |
| Networking | Cilium 1.20.2, cluster-pool IPAM, VXLAN, NetworkPolicy |
| Ingress and API | MetalLB shared address; three Traefik replicas and health-checked API routing |
| GitOps | Argo CD HA profile and app-of-apps |
| Persistent storage | Longhorn 1.13.0; three replicas per volume |
| Observability | Prometheus, Grafana, Alertmanager, node and Kubernetes metrics |
| Workloads | Go and Node.js applications deployed with Helm |
| Infrastructure | Terraform-managed Helm releases and adopted Terraform state |

The node inventory is in [infrastructure/nodes.yaml](infrastructure/nodes.yaml). Nodes are devops (.178), devops-worker-prox4 (.181), and devops-control-prox4 (.182). The shared ingress and Kubernetes API address is .179; it is not a node address. See [architecture](docs/architecture.md) for traffic flow and [operations](docs/operations.md) for maintenance procedures.

## What this project demonstrates

- Infrastructure and software versions declared in Git.
- CI builds and smoke-tests application images, then promotes commit-tagged images through Helm values.
- Argo CD reconciles application and platform configuration.
- Cilium network policies, Traefik ingress, and Kubernetes API routing.
- Longhorn-backed persistent volumes across the three Kubernetes nodes.
- Safe Terraform adoption of existing releases rather than recreating them.
- Gitleaks and Trivy checks in GitHub Actions.

Passwords, kubeconfigs, join tokens, private keys, Terraform state, and backup credentials must stay outside Git.

## Run the checks

The repository's validation and rendering scripts use Bash, yq, and jq. Python is not required.

~~~bash
bash scripts/validate-platform.sh
helm lint charts -f charts/values-go.yaml
helm lint charts -f charts/values-node.yaml
bash -n scripts/*.sh
bash scripts/render-platform.sh
terraform -chdir=terraform init -backend=false
terraform -chdir=terraform fmt -check -recursive
terraform -chdir=terraform validate
~~~

Install Bash, [yq](https://github.com/mikefarah/yq), jq, Helm 3, kubectl, Terraform, and curl first. Rendering creates local files under rendered/ and schemas/; it does not connect to the live cluster. GitHub Actions runs Terraform, Helm, YAML, Kubernetes schema, shell syntax, and secret-scanning checks on pull requests.

## Access

- [Argo CD](https://argocd.murabba.net/)
- [Grafana](https://grafana.murabba.net/)
- [Prometheus](https://prometheus.murabba.net/) — Basic Auth is enabled.
- [Go application](https://go.murabba.net/)
- [Node.js application](https://node.murabba.net/)

Grafana sends unauthenticated users to its login page. Prometheus returns HTTP 401 without Basic Auth; these are expected responses.

## Suggested next improvements

The core hands-on platform is working. The best next steps improve recovery evidence and make the project easier to present, rather than adding more cluster components:

1. Configure scheduled, encrypted Longhorn backups to the external backup target. Perform a restore drill and document what was recovered.
2. Add a post-deployment check for application health, Prometheus scrape targets, and public routes.
3. Document one real delivery from application commit through GitHub Actions, Helm values, and Argo CD sync; add architecture and recovery diagrams.
4. Add image provenance and signing after the build-and-deploy flow is clear.

Longhorn replicas help keep volumes available across Kubernetes nodes, but they are not an off-cluster backup. Etcd backups protect Kubernetes state, not application volume contents. Upgrade Kubernetes one minor version at a time after checking CNI and storage compatibility. This is a learning and portfolio project, not a production service.

## Documentation

- [Architecture](docs/architecture.md)
- [Operations and migration](docs/operations.md)
- [شرح المشروع بالعربي](docs/platform-explained-ar.md)
- [Storage and recovery](docs/storage-and-recovery.md)

MIT License. Maintained by [@egyhaty](https://github.com/egyhaty).
