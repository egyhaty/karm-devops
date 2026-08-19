# Karm DevOps Platform

A production-oriented Kubernetes platform demonstrating infrastructure as code, GitOps delivery, secure configuration management, TLS automation, and observability.

This repository is also an interview-ready portfolio project. It is designed to show how I approach platform design, repeatable deployments, operational troubleshooting, and production safety.

## Professional focus

- Kubernetes administration and workload operations
- GitOps with Argo CD
- Helm-based application packaging
- Infrastructure as code with Terraform
- Ingress and automated TLS with Traefik and cert-manager
- Encrypted secret delivery with Sealed Secrets
- Metrics, dashboards, and alerting with Prometheus, Grafana, and Alertmanager
- Linux infrastructure operations and incident troubleshooting

> Kubernetes administration knowledge is backed by the Certified Kubernetes Administrator (CKA) certification. This project demonstrates how that knowledge is applied in an end-to-end platform workflow.

## Architecture

```text
Developer
   |
   +--> GitHub Actions
   |      +--> lint and validation
   |      +--> security checks
   |      +--> image build and publish
   |
   +--> Git repository
             |
             +--> Argo CD
                    |
                    +--> Kubernetes cluster
                           +--> Application workloads
                           +--> Traefik ingress
                           +--> cert-manager
                           +--> Sealed Secrets
                           +--> Prometheus / Grafana / Alertmanager
```

## Repository layout

| Path | Purpose |
|---|---|
| `terraform/` | Infrastructure provisioning and repeatability |
| `charts/` | Helm charts and application packaging |
| `argocd/` | Argo CD applications and GitOps configuration |
| `traefik/` | Ingress and traffic-routing configuration |
| `cert-manager/` | Certificate lifecycle configuration |
| `sealed-secrets/` | Encrypted secret manifests |
| `monitoring/` | Metrics, dashboards, and alerting configuration |
| `golang/` | Go application workload |
| `nodejs/` | Node.js application workload |
| `docs/` | Architecture, runbooks, troubleshooting, and security notes |

## GitOps workflow

1. A change is made through Git and reviewed.
2. Validation and security checks run before deployment.
3. The desired state is stored in the repository.
4. Argo CD reconciles the desired state with the Kubernetes cluster.
5. Health status and drift are observed through Argo CD and monitoring.
6. A failed release can be investigated and rolled back through Git.

## Platform capabilities

### Kubernetes operations

The project covers workload deployment, resource configuration, health checks, ingress, TLS, secrets, and operational troubleshooting. Resource requests and limits, readiness/liveness behavior, rollout safety, and failure recovery should be considered for every workload.

### Delivery and packaging

Helm provides repeatable application packaging and environment-aware configuration. Argo CD provides continuous reconciliation, drift detection, deployment history, and Git-based rollback.

### Security

Secrets should never be committed in plaintext. Sealed Secrets are used for encrypted secret delivery, and the security documentation describes repository checks and operational safeguards.

### Observability

Prometheus collects metrics, Grafana provides dashboards, and Alertmanager routes alerts. The runbooks connect symptoms to investigation commands and recovery actions.

## Operational scenarios

The project is intended to be demonstrated through scenarios such as:

- A pod enters `CrashLoopBackOff`.
- A deployment remains unavailable because readiness checks fail.
- A service cannot reach its target pods.
- A certificate approaches expiry or fails issuance.
- Argo CD detects drift or a failed synchronization.
- A rollout requires a controlled rollback.
- Metrics or alerts indicate resource pressure.

See the [troubleshooting guide](docs/troubleshooting.md) and [runbook](docs/runbook.md).

## Getting started

The exact infrastructure and cluster requirements depend on the environment in which the project is deployed.

1. Review the [architecture documentation](docs/architecture.md).
2. Inspect the Terraform variables and backend configuration.
3. Review the Helm values and Argo CD application definitions.
4. Ensure that required DNS, TLS, and secret prerequisites are available.
5. Deploy infrastructure and cluster prerequisites through the documented workflow.
6. Apply the GitOps configuration and verify application health in Argo CD.
7. Confirm ingress, certificates, metrics, dashboards, and alerts.

Do not commit kubeconfig files, private keys, cloud credentials, Terraform state, or plaintext secrets.

## Design decisions

- Git is the source of truth for the desired application state.
- Helm separates packaging from environment-specific values.
- Argo CD continuously reconciles the cluster and exposes drift.
- Sealed Secrets allow encrypted secret manifests to be versioned without exposing plaintext values.
- Monitoring is treated as part of the platform, not an afterthought.
- Operational documentation is versioned beside the implementation.

## Portfolio discussion points

When presenting this project, be prepared to explain:

- How Argo CD detects and corrects drift.
- How a failed deployment is diagnosed and rolled back.
- How Kubernetes networking connects ingress, services, and pods.
- How secrets are protected throughout the Git workflow.
- How Terraform state should be managed by a team.
- Which availability, security, and observability trade-offs would change in production.

## Documentation

- [Architecture](docs/architecture.md)
- [Operations runbook](docs/runbook.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Security](docs/security.md)
- [Security policy](SECURITY.md)

## Disclaimer

This is a portfolio and learning project. Environment-specific values, credentials, domains, and operational controls must be reviewed before using the configuration in a production environment.
