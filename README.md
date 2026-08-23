# karm-devops

A Kubernetes GitOps platform built with Terraform, Helm, Argo CD, Traefik, cert-manager, MetalLB, Sealed Secrets, and GitHub Actions.

## Architecture

```text
Developer
   |
   v
GitHub Pull Request
   |
   v
GitHub Actions
   |- Terraform validation
   |- Helm lint
   |- YAML validation
   |- Kubernetes schema validation
   |- Gitleaks
   `- Trivy config scan
   |
   v
Merge to main
   |
   v
Argo CD App-of-Apps
   |
   v
Helm and Kubernetes
   |- Go application
   |- Node.js application
   |- Monitoring
   |- Metrics Server
   |- Sealed Secrets
   |- Traefik Ingress
   `- cert-manager TLS
```

The repository is the source of truth. Terraform is used for infrastructure validation and initial provisioning, Helm packages Kubernetes resources, and Argo CD continuously reconciles the desired state from Git. The App-of-Apps pattern lets one root Argo CD application manage the child applications under `argocd/apps/`.

## Repository layout

- `terraform/`: infrastructure definitions and validation.
- `charts/`: Helm chart and environment values.
- `argocd/app-of-apps.yaml`: root GitOps application.
- `argocd/apps/`: child Argo CD applications.
- `sealed-secrets/`: encrypted secret manifests safe to store in Git.
- `monitoring/`: monitoring resources and alerting configuration.
- `.github/workflows/`: CI validation and security checks.
- `docs/`: architecture and interview material.

## Delivery flow

1. A change is submitted through a Pull Request.
2. GitHub Actions validates Terraform, Helm, YAML, and rendered Kubernetes manifests.
3. Gitleaks blocks exposed secrets; Trivy reports infrastructure-as-code findings.
4. After review and merge, Argo CD detects the Git change and reconciles the cluster.
5. Health is verified through Argo CD, Kubernetes, ingress routing, and application checks.
6. Rollback is performed by reverting the Git commit or selecting a previous Argo CD revision.

## Validation commands

```bash
terraform -chdir=terraform fmt -check -recursive
terraform -chdir=terraform init -backend=false -input=false
terraform -chdir=terraform validate
helm lint charts
python -m yamllint -c .yamllint.yml $(git ls-files '*.yml' '*.yaml')
helm template karm charts > /tmp/karm-rendered.yaml
kubeconform -strict -summary /tmp/karm-rendered.yaml
gitleaks detect --source . --config .gitleaks.toml --redact
trivy config .
```

## Security model

- No plaintext credentials are committed.
- Sealed Secrets are encrypted before they enter Git.
- Gitleaks is a blocking gate for all non-allowlisted paths.
- The allowlist is limited to encrypted Sealed Secret manifests and a public certificate.
- Trivy scans IaC configuration and produces an artifact report.
- CI has read-only repository permissions and does not run `terraform apply`.

## GitOps demonstration

The branch includes a reversible Node.js replica-count change used to demonstrate the flow:

```text
Git commit -> CI validation -> Argo CD detects drift -> sync -> verify -> revert
```

This branch is for validation and demonstration. It is not merged or deployed by this change.

