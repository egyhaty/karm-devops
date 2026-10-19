# Contributing

Keep changes focused and describe their effect on the cluster. Do not include credentials, kubeconfigs, private keys, Terraform state, or unencrypted Kubernetes Secrets.

## Before opening a pull request

Run the checks relevant to your change. The platform workflow runs these on pull requests that touch platform files:

```bash
bash scripts/validate-platform.sh
bash -n scripts/*.sh
terraform -chdir=terraform fmt -check -recursive
terraform -chdir=terraform init -backend=false
terraform -chdir=terraform validate
helm lint charts -f charts/values-node.yaml
helm lint golang/deploy/chart
```

The workflow also renders the Kubernetes resources, checks their schemas, and scans for secrets. Application image builds and container smoke tests currently run after changes are merged to `main`.

In the pull request, explain what changed, how you checked it, and any effect on storage, networking, or recovery. Route cluster changes through Git and Argo CD.
