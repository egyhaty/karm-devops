# Platform Architecture

## Purpose

`karm-devops` is a Kubernetes platform organized as a single repository. Git stores the desired state, GitHub Actions validates changes, and Argo CD reconciles approved changes into the cluster.

## Components

| Layer | Components | Responsibility |
|---|---|---|
| Infrastructure | Terraform | Reproducible infrastructure definitions and validation. |
| Packaging | Helm | Reusable Kubernetes templates and values. |
| GitOps CD | Argo CD | Reconcile Git state with cluster state. |
| Application | Go, Node.js | Workloads deployed through Argo CD child applications. |
| Edge | Traefik, MetalLB | Ingress routing and load-balancer IP allocation. |
| TLS | cert-manager | Certificate issuance and renewal. |
| Secrets | Sealed Secrets | Encrypted secret manifests stored in Git. |
| Observability | Monitoring stack | Metrics, dashboards, and alerting. |
| CI security | Gitleaks, Trivy | Secret detection and IaC configuration scanning. |

## GitOps flow

```text
Pull Request
  -> CI validation
  -> code review and merge
  -> Argo CD observes Git
  -> child Applications reconcile
  -> Kubernetes health checks
  -> ingress and application verification
```

`argocd/app-of-apps.yaml` is the root entry point. Its child applications are stored under `argocd/apps/`, including the Go and Node.js workloads, monitoring, Metrics Server, and Sealed Secrets.

## CI controls

The validation workflow has independent jobs for Terraform, Helm, YAML, Kubernetes schema, and security. Jobs run without cluster credentials. The security job runs Gitleaks as a pinned binary and Trivy from a pinned Action reference. Gitleaks blocks findings except for the narrowly scoped encrypted Sealed Secret and public-certificate paths defined in `.gitleaks.toml`.

## Operational boundaries

CI validates configuration; it does not provision infrastructure or deploy workloads. Deployment is performed by Argo CD after the Git change is approved and merged. This separation limits CI permissions and creates an auditable promotion path.

## Rollback

The preferred rollback is a Git revert because Git remains the source of truth. Argo CD then reconciles the reverted desired state. For an urgent operational rollback, Argo CD can select a previous revision, followed by a Git revert so the repository and cluster converge again.
