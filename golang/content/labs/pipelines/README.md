# Plan-only CI examples

These `.example` files do not execute in this repository. Copy to a separate sandbox only after cloud federation and environment/service-connection checks are configured. Each assumes the checked-out Terraform lab remains at its repository-relative path.

- [AWS GitHub plan](./aws-plan.yml.example): environment `cloud-lab`; exact environment OIDC subject; set AWS_REGION, AWS_PLAN_ROLE_ARN, LAB_STATE_BUCKET, LAB_CERTIFICATE_ARN, LAB_HOSTNAME, LAB_CLIENT_CIDR, WORDPRESS_VERSION, WORDPRESS_SHA256.
- [Azure GitHub plan](./azure-github-plan.yml.example): environment `azure-lab`; set AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID, LAB_STATE_ACCOUNT, LAB_STORAGE_ACCOUNT, LAB_SSH_PUBLIC_KEY.
- [Azure DevOps plan](./azure-pipelines.yml.example): WIF service connection; authorize only the intended pipeline and configure checks outside YAML. Set controlled project variables listed in the file. Install a reviewed Terraform version on the trusted runner first; the sample intentionally fails if it is absent.

Cloud identifiers/public SSH keys are not passwords. No static AWS key or Azure client secret is used. Still restrict logs: a plan can reveal sensitive data. No plan artifact upload, automatic apply, pull_request_target or untrusted-PR cloud execution is included. Action tags are readable teaching references: replace them with audited immutable commit SHAs before privileged use. A real apply flow must bind approval to commit/state/plan and secure artifact retention; it is not supplied as an implicit deployment path.
