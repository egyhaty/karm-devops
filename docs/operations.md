# Operations

## Existing-cluster adoption

Keep Terraform state encrypted and backed up outside Git. Compare existing release values with the repository before importing and planning. For the manually installed Cilium release:

```bash
terraform -chdir=terraform import helm_release.cilium kube-system/cilium
terraform -chdir=terraform plan
```

Import other pre-existing resources as needed using their provider-supported identifiers. Review the entire plan; do not apply a fresh state to recreate installed infrastructure. Argo CD manages application resources; avoid giving Terraform ownership of the same resources.

## Platform migration

The platform was migrated from a single-node Flannel setup to a three-node Kubernetes control plane using Cilium networking and highly available ingress. The process included protected control-plane and workload backups, staged node-by-node CNI migration, policy canaries, health-checked API routing, and verification of cluster and application readiness. Sensitive backup inventory and host-specific locations are maintained outside this public repository.

## Maintenance

Current platform versions are Kubernetes 1.36.5, Cilium 1.20.2 and Longhorn 1.13.0. Upgrade Kubernetes one minor version at a time and check CNI and storage compatibility before starting. Check nodes, etcd health, Cilium status, application readiness, API readiness and public routes before draining one node. Check disruption budgets; migrate only one etcd member at a time. Before monitoring pod or node maintenance, verify all monitoring PVCs are Bound and their Longhorn volumes are healthy.

Longhorn currently has no configured external backup target or recurring backup jobs. The external destination must expose NFS or an S3-compatible endpoint before scheduled Longhorn backups can be enabled. See [storage and recovery](storage-and-recovery.md) for the recovery policy and limitations.

```bash
kubectl get nodes
kubectl get pods -A -o wide
kubectl get pdb -A
kubectl get --raw=/readyz
kubectl -n argocd get applications
```

A worker name can remain unchanged after promotion; rely on node roles and inventory for audit. `scripts/use-local-control-plane-api.sh` requires a verified control-plane node and its allocated NODE_IP, and updates only that node's kubelet API address.

## Recovery and rollback

Use Git revert for application and policy changes, then verify Argo reconciliation. CNI migration rollback is a controlled node-by-node operation: restore backed-up CNI configuration, restore Flannel only when its network cannot conflict with active Cilium pods, and recreate workloads deliberately. Reapplying an old daemonset alone is insufficient. Restore etcd snapshots using the matching Kubernetes/etcd recovery procedure; never overwrite a healthy live member's data directory.

Grafana redirects to login normally. Prometheus returns HTTP 401 without Basic Auth. Verify service health separately from authentication and do not disable authentication to turn a monitoring probe green.
