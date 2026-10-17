# Operations

## Existing-cluster adoption

Terraform state is kept in the local, Git-ignored `terraform/terraform.tfstate` file because it contains details about managed resources. Back it up securely before provider upgrades. A fresh clone needs the state restored, or the existing resources imported, before it can plan against this cluster. Compare release values with the repository before importing or planning. For the manually installed Cilium release:

```bash
terraform -chdir=terraform import helm_release.cilium kube-system/cilium
terraform -chdir=terraform plan
```

Import other pre-existing resources as needed using their provider-supported identifiers. Review the entire plan; do not apply a fresh state to recreate installed infrastructure. Argo CD manages application resources; avoid giving Terraform ownership of the same resources.

## Platform migration

The cluster started as a single-node Flannel setup. It now has three Kubernetes VMs, Cilium networking and a shared ingress/API address. The migration included node-by-node network changes, a policy test, API health checks, and application checks.

## Replacing a node

For a fresh Ubuntu 24.04 VM, `scripts/bootstrap-node.sh` installs the Kubernetes node packages and configures the local node address; joining the cluster is a separate step that needs a short-lived kubeadm token. If the VM has a new dedicated Longhorn disk, `scripts/prepare-storage-node.sh` checks its serial and size before formatting it for `/var/lib/longhorn`. It is only for a blank disk provisioned for this purpose.

## Maintenance

Current platform versions are Kubernetes 1.36.5, Cilium 1.20.2 and Longhorn 1.13.0. Upgrade Kubernetes one minor version at a time and check CNI and storage compatibility before starting. Check nodes, etcd health, Cilium status, application readiness, API readiness and public routes before draining one node. Check disruption budgets; migrate only one etcd member at a time. Before monitoring pod or node maintenance, verify all monitoring PVCs are Bound and their Longhorn volumes are healthy.

Longhorn 1.13 is configured with a daily SMB/CIFS backup job that retains the latest seven backups for each volume. The backup endpoint is configured on the cluster and kept out of public Git; its CIFS credentials are stored as a SealedSecret. A canary backup and restore has been verified. SMB encryption protects the transfer, while the default StorageClass remains unencrypted, so at-rest encryption is not guaranteed. See [storage and recovery](storage-and-recovery.md) for the restore test and limitations.

```bash
kubectl get nodes
kubectl get pods -A -o wide
kubectl get pdb -A
kubectl get --raw=/readyz
kubectl -n argocd get applications
```

The node inventory lists each VM's role. `scripts/use-local-control-plane-api.sh` points the selected node's kubelet at its local API server; set `NODE_IP` to that VM's address before running it.

## Recovery and rollback

Use Git revert for application and policy changes, then verify Argo reconciliation. CNI migration rollback is a controlled node-by-node operation: restore backed-up CNI configuration, restore Flannel only when its network cannot conflict with active Cilium pods, and recreate workloads deliberately. Reapplying an old daemonset alone is insufficient. For control-plane recovery, follow the etcd restore steps for the Kubernetes version in use and preserve the data directories of members that are still healthy.

Grafana redirects to login normally. Prometheus returns HTTP 401 without Basic Auth. Verify service health separately from authentication and do not disable authentication to turn a monitoring probe green.
