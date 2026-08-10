# GitOps Kubernetes Platform

A production-style Kubernetes platform managed through GitOps. The repository defines application delivery, ingress, TLS, monitoring, and secret management so that changes are reviewed and versioned in Git, then reconciled into the cluster by Argo CD.

## What this platform delivers

- GitOps-based continuous delivery with Argo CD and an app-of-apps bootstrap pattern.
- Public HTTPS routing through Traefik and cert-manager-managed TLS certificates.
- Prometheus and Grafana monitoring for Kubernetes, workloads, and node health.
- Sealed Secrets for keeping encrypted secrets in Git without committing plaintext credentials.
- Go and Node.js workloads deployed from declarative Kubernetes/Helm configuration.
- Terraform configuration for infrastructure provisioning.

## Architecture

```text
Developer / CI
      |
      v
GitHub repository (desired state)
      |
      v
Argo CD app-of-apps
      |
      +-- Go application
      +-- Node.js application
      +-- Monitoring stack
      +-- Sealed Secrets configuration
      |
      v
Kubernetes cluster
      |
      +-- Traefik Ingress Controller
      |       +-- HTTPS endpoints
      |
      +-- cert-manager
      |       +-- TLS certificate lifecycle
      |
      +-- Prometheus + Grafana
      |       +-- Cluster, namespace, pod, and node visibility
      |
      +-- Application workloads
```

## Core components

| Component | Purpose |
| --- | --- |
| Argo CD | Continuously reconciles the cluster with the desired state stored in Git. |
| Traefik | Routes external HTTPS traffic to services inside the cluster. |
| cert-manager | Obtains and renews TLS certificates for public endpoints. |
| Prometheus | Collects Kubernetes, application, and node metrics. |
| Grafana | Visualizes cluster capacity, namespace resource usage, and node health. |
| Sealed Secrets | Stores encrypted secrets safely in the repository and materializes Kubernetes Secrets in-cluster. |
| Terraform | Keeps infrastructure provisioning reproducible and version controlled. |

## GitOps workflow

1. A change is committed to this repository.
2. Argo CD detects the new revision on `main`.
3. Argo CD compares Git with the live cluster state.
4. The required Kubernetes resources are applied automatically.
5. Argo CD reports the application as `Synced` and `Healthy`.
6. Prometheus and Grafana expose the operational impact of the change.

The platform currently manages the `app-of-apps`, `golang`, `nodejs`, `monitoring`, `sealed-secrets`, and `sealed-secrets-values` applications through Argo CD.

## Repository layout

```text
.
├── argocd/           # Bootstrap application, managed applications, certificate, and Traefik routes
├── cert-manager/     # Certificate-management resources
├── charts/            # Helm chart and workload values
├── golang/            # Go application manifests
├── monitoring/        # Prometheus, Grafana, Alertmanager, and dashboards
├── nodejs/            # Node.js application manifests
├── sealed-secrets/    # Encrypted secret manifests
├── terraform/         # Infrastructure-as-code configuration
└── traefik/           # Ingress controller configuration
```

## Security model

- Public endpoints are served through HTTPS with certificates managed by cert-manager.
- Traefik terminates TLS at the cluster edge and routes traffic only to the intended internal services.
- Argo CD operates behind Traefik with `server.insecure: "true"`; this permits internal HTTP between Traefik and the Argo CD server while HTTPS remains enforced externally.
- Sensitive values are stored as Sealed Secrets rather than plaintext Kubernetes Secrets.
- Deployment state and operational configuration are auditable through Git history.

## Observability

The monitoring stack provides visibility at several layers:

- **Cluster:** CPU and memory utilization, requests/limits, namespace consumption, network, and storage activity.
- **Workloads:** Pod and namespace resource usage across system and application namespaces.
- **Node:** CPU, memory, filesystem, uptime, and network health through Node Exporter.
- **Applications:** Deployment health and reconciliation status through Argo CD.

## Validation checklist

```bash
# GitOps application health
kubectl get applications -n argocd

# Argo CD reverse-proxy configuration
kubectl get configmap argocd-cmd-params-cm -n argocd \
  -o jsonpath='{.data.server\.insecure}'; echo

# Encrypted-secret reconciliation
kubectl get sealedsecrets -A

# Platform workloads
kubectl get pods -A
```

A healthy platform should show Argo CD applications as `Synced` and `Healthy`, `server.insecure` as `true`, and Sealed Secrets as synchronized.

## Design principles

- **Declarative:** The repository describes the desired environment.
- **Repeatable:** Infrastructure and application configuration can be recreated from version-controlled definitions.
- **Observable:** Metrics and dashboards make platform health measurable.
- **Secure by default:** TLS and encrypted secret management are built into the delivery path.
- **Auditable:** Operational changes are captured in Git commits.

## Next improvements

- Add alert rules and notification routing for service and workload failures.
- Add CI validation for Helm rendering, Kubernetes manifests, and policy checks before merge.
- Add automated backup and restore procedures for critical platform state.
- Add screenshots or dashboard links to this document for operational walkthroughs.
