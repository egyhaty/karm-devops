# Interview Guide

## Two-minute explanation

I built a Kubernetes GitOps platform as a monorepo. Terraform describes the infrastructure layer, Helm packages workloads, and Argo CD applies the desired state from Git through an App-of-Apps structure. Traefik handles ingress, MetalLB provides load-balancer addresses for the on-premise environment, cert-manager automates TLS, and Sealed Secrets keeps encrypted credentials in Git. GitHub Actions validates Terraform, Helm, YAML, rendered Kubernetes manifests, secrets, and IaC configuration before merge.

## Why these tools

- Terraform gives reproducible infrastructure definitions and a reviewable plan.
- Helm avoids duplicating Kubernetes manifests and separates templates from values.
- Argo CD provides continuous reconciliation and drift visibility.
- App-of-Apps gives one root entry point while keeping child applications modular.
- Traefik provides Kubernetes-native ingress routing.
- MetalLB fills the LoadBalancer gap in bare-metal clusters.
- cert-manager removes manual certificate renewal.
- Sealed Secrets protects credentials while retaining GitOps workflows.
- Gitleaks and Trivy catch different classes of risk: leaked secrets versus IaC misconfiguration.

## Security decisions

CI uses least-privilege read permissions and does not contain cluster or cloud credentials. Gitleaks remains blocking. Trivy is initially report-only so findings can be triaged without hiding them; the policy can later become blocking by severity after a baseline is agreed.

## Failure story

The first security failure was an invalid Gitleaks Action reference: a Trivy commit SHA had been used for a different action. The fix was to run a pinned Gitleaks binary directly and keep the Trivy action separate. The next failure was a real detection in encrypted Sealed Secret material and a public certificate; a narrow path-based allowlist resolved only those intentional artifacts while preserving detection elsewhere.

## GitOps demo

A safe demonstration changes the Node.js replica count in Git. CI validates the commit, Argo CD detects the desired-state change, and the operator verifies rollout and health. Reverting the commit demonstrates rollback without imperative production changes.

## Questions to expect

### How do you prevent bad Kubernetes YAML?

Run YAML parsing, yamllint, Helm lint, render the charts, then validate the rendered resources against Kubernetes schemas with kubeconform.

### How are secrets handled?

Plaintext secrets are not committed. Sealed Secrets encrypt the values before Git, and Gitleaks remains enabled to catch accidental leaks outside the encrypted paths.

### What happens if the cluster drifts?

Argo CD detects the difference between Git and the cluster and can reconcile it. Git remains authoritative, so manual changes should be followed by a Git change or reverted.

### How would you promote environments?

Use environment-specific values or overlays, require CI and review at each promotion, and let Argo CD target separate namespaces or clusters.

### What would you improve next?

Add image scanning and signing, SBOM generation, policy-as-code, environment promotion, stronger branch protection, and explicit SLO-based monitoring.
