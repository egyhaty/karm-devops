# Contributing

Thanks for your interest in improving Karem On-Prem DevOps Platform.

## Workflow

1. Create a focused change.
2. Keep infrastructure and application changes small and reviewable.
3. Run the relevant Terraform, Helm, YAML, and secret checks locally.
4. Explain operational impact in the pull request description.
5. Never commit credentials, kubeconfig files, private keys, or unencrypted secrets.

## Local Validation

```bash
terraform -chdir=terraform fmt -check -recursive
terraform -chdir=terraform validate
yamllint .
gitleaks detect --redact --verbose
```

Run Helm lint against each chart that you change:

```bash
helm lint ./charts/<chart-name>
```

## Pull Requests

Include:

- What changed and why.
- Which environments are affected.
- How the change was tested.
- Any migration, rollback, or security considerations.

Changes to the live cluster should be performed through the documented GitOps workflow whenever possible.
