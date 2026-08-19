# CI validation

The repository includes a validation-only GitHub Actions workflow at `.github/workflows/platform-validation.yml`.

The workflow runs on pull requests, pushes to the main validation branches, and manual dispatch. It performs:

- Terraform format and validation without a backend or apply step.
- Helm linting.
- YAML parsing and yamllint checks.
- Kubernetes schema validation for rendered Helm manifests with kubeconform.
- Gitleaks secret scanning.
- Trivy IaC/config scanning using a pinned action version.

The workflow does not deploy workloads, run `terraform apply`, access a Kubernetes cluster, or use cloud credentials.