# Security Notes

## Repository safeguards

Never commit:

- Private keys or certificates containing private key material.
- Cloud access keys, tokens, passwords, or API credentials.
- Kubeconfig files with embedded credentials.
- Terraform state containing sensitive values.
- Plaintext Kubernetes Secret manifests.
- Production domains or internal endpoints unless intentionally public.

The repository should be checked with secret-scanning tools before pushing changes. A public certificate may be safe to publish, but it must be verified that it does not include a private key or unintended metadata.

## Kubernetes safeguards

- Use least-privilege RBAC.
- Use dedicated service accounts for workloads.
- Restrict pod-to-pod communication with NetworkPolicies where supported.
- Define resource requests and limits.
- Avoid privileged containers unless explicitly required.
- Use read-only root filesystems where compatible.
- Pin image versions instead of relying on mutable tags.
- Keep ingress exposure limited to required routes.

## GitOps safeguards

- Protect the default branch.
- Require pull-request review for production changes.
- Run validation and secret scanning in CI.
- Restrict who can synchronize production applications.
- Review Argo CD diffs before synchronization.
- Keep deployment credentials out of GitHub Actions logs.

## Terraform safeguards

- Use a secured remote backend with state locking.
- Restrict access to state and encrypt it at rest.
- Do not pass secrets through unprotected variables or command output.
- Review plans before apply.
- Use separate state and permissions for separate environments.

## Incident response

If a credential is committed:

1. Revoke or rotate it immediately.
2. Remove it from the active configuration.
3. Review access logs for misuse.
4. Rewrite Git history only after containment and coordination.
5. Document the incident and add a preventive control.
