# Security

This is a public Kubernetes lab. The repository contains the cluster manifests and encrypted SealedSecret resources, but it must not contain the keys or credentials needed to use them.

## What stays private

- Sealed Secrets private key, kubeconfig credentials, SSH private keys, tokens, and passwords.
- Terraform state and the key for the off-cluster migration archive.
- The external backup share address and any host-specific access details.

Use the public certificate in `pub-cert.pem` with `kubeseal --cert pub-cert.pem --format yaml` to encrypt new Secret manifests. The certificate is safe to keep in Git; the controller's private key is not. Refresh the certificate from the cluster after its key is rotated.

The CI workflow scans commits with Gitleaks and checks configuration with Trivy. The SealedSecret manifests in `sealed-secrets/` are encrypted for this cluster; they are not a replacement for protecting the controller's private key.

## Changes to the cluster

Argo CD applies the configuration from `main`. For platform-file pull requests, the validation workflow checks Terraform, Helm rendering, Kubernetes schemas, shell and YAML syntax, and secrets. Review changes that affect network access, storage, or credentials. Terraform manages selected platform releases; Argo CD manages applications and Kubernetes resources.

## If a credential is exposed

Rotate it first, then update the cluster secret and remove the exposed value from active configuration. Review the relevant access logs. Cleaning Git history is a follow-up; it does not make an exposed credential safe again.
