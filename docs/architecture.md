# Platform architecture

Git stores desired configuration. GitHub Actions validates configuration, smoke-tests application images, publishes commit-tagged images with signed build provenance, and promotes them through Helm values; Argo CD reconciles application resources. Terraform manages selected infrastructure releases through an explicitly maintained state.

```mermaid
flowchart LR
  Git[Git repository] --> CI[Validate and build]
  CI --> Registry[Container registry]
  CI --> Values[Promote image tags in Helm values]
  Values --> Argo[Argo CD]
  Argo --> Apps[Go and Node.js workloads]
  Registry --> Apps
  Clients[HTTPS clients] --> VIP[MetalLB ingress address]
  VIP --> Traefik[Traefik replicas]
  Traefik --> Apps
  Traefik --> UI[Argo CD and monitoring]
  Traefik --> API[Health-checked Kubernetes API]
  Cilium[Cilium overlay and policies] --> Apps
  Prom[Prometheus] --> Metrics[Application and node metrics]
  Apps --> PVC[Longhorn persistent volumes]
  PVC -. planned .-> Backup[Planned encrypted off-cluster backup]
  Backup -. restore drill .-> PVC
```

The current application images provide a traceable delivery example:

- Build source revision: [`002200d`](https://github.com/egyhaty/karm-devops/commit/002200d484b62e1104821a93d6d212f50b97ed90).
- [GitHub Actions run 49](https://github.com/egyhaty/karm-devops/actions/runs/38869857895) built and smoke-tested both images, published them, and created signed provenance attestations for their registry digests.
- Image promotion commit: [`e91fb33`](https://github.com/egyhaty/karm-devops/commit/e91fb33ffccaaaa690c20eb1b658dd2ffa6e474b), recording `sha-002200d` for both applications.
- Argo CD reconciled the Helm values; the live applications report Synced/Healthy with three ready replicas each.

The [post-deployment workflow](https://github.com/egyhaty/karm-devops/actions/workflows/post-deployment-check.yml) checks public health and metrics routes. Prometheus scrape target validation runs when the `PROMETHEUS_BASIC_AUTH` GitHub Actions secret is configured.
Each node runs an API server, controller manager, scheduler, etcd member and application workloads. Three etcd members require two healthy members for quorum. Losing one member can preserve Kubernetes state availability; losing two cannot.

MetalLB advertises the shared service address. Traefik terminates public application TLS and forwards Kubernetes API TLS without termination. Its API backend checks all control-plane node addresses. API TLS authentication and authorization remain with Kubernetes.

Cilium agents and operators contact their own node's API using `status.hostIP`. Kubelet configurations likewise use local APIs. Cilium allocates pod addresses from its own cluster pool independently of legacy node podCIDR metadata. Kube-proxy handles Kubernetes Services.

Application network policies allow ingress from Traefik, monitoring and peer workloads. Egress permits DNS and application peers; unrelated egress is denied. Hubble provides internal traffic visibility. Infrastructure namespaces retain upstream network policy settings.

The Argo CD HA profile replicates HTTP servers, repository servers and Redis. Monitoring runs node exporters on all nodes; Prometheus, Grafana and Alertmanager use Longhorn persistent volumes. Volume replication supports availability across Kubernetes nodes but does not provide an off-cluster backup or full failure-domain independence.
