# Architecture

## Objective

Karm DevOps demonstrates an end-to-end platform workflow for deploying and operating containerized workloads on Kubernetes. The design emphasizes repeatability, GitOps reconciliation, secure configuration, TLS automation, and observability.

## Components

| Component | Responsibility |
|---|---|
| Terraform | Provisions repeatable infrastructure and manages declared resources |
| Kubernetes | Schedules and runs application workloads |
| Helm | Packages applications and manages configurable deployment values |
| Argo CD | Reconciles Git state with cluster state and reports drift |
| Traefik | Handles ingress routing into the cluster |
| cert-manager | Automates certificate requests and renewal |
| Sealed Secrets | Stores encrypted secret manifests in Git |
| Prometheus | Collects platform and workload metrics |
| Grafana | Provides dashboards for investigation and trends |
| Alertmanager | Groups and routes alerts |

## Request flow

1. A client resolves the application hostname through DNS.
2. Traffic reaches the Traefik ingress controller.
3. Traefik terminates or routes TLS according to the configured ingress resources.
4. The Kubernetes Service selects healthy pods using labels.
5. The application returns the response.
6. Prometheus collects metrics and Alertmanager evaluates alert conditions.

## Deployment flow

1. Changes are committed to Git.
2. CI validates manifests, charts, Terraform, and security-sensitive content.
3. Argo CD observes the desired state.
4. Argo CD applies changes to the target cluster.
5. Kubernetes performs the rollout according to the workload strategy.
6. Health checks and monitoring determine whether the release is healthy.

## Reliability considerations

- Use readiness probes to prevent traffic from reaching unready pods.
- Use liveness probes only when a restart is a safe recovery action.
- Define resource requests and limits based on observed workload behavior.
- Use PodDisruptionBudgets for workloads that need availability during voluntary disruption.
- Keep deployments reversible through Git history and controlled rollout strategy.
- Monitor both symptoms and saturation signals such as CPU, memory, restarts, and latency.

## Security boundaries

- Git contains desired configuration, not plaintext credentials.
- Kubernetes RBAC should follow least privilege.
- Ingress and service exposure should be explicit.
- Images should be scanned before publication.
- Terraform state requires controlled access and secure storage.

## Production evolution

For a larger production environment, the design should additionally address multi-node failure domains, remote Terraform state locking, image signing, policy enforcement, centralized logging, backup and restore testing, disaster recovery objectives, and controlled multi-environment promotion.
