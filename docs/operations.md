# Operations

## Existing-cluster adoption

Keep Terraform state encrypted and backed up outside Git. Compare existing release values with the repository before importing and planning. For the manually installed Cilium release:

```bash
terraform -chdir=terraform import helm_release.cilium kube-system/cilium
terraform -chdir=terraform plan
```

Import other pre-existing resources as needed using their provider-supported identifiers. Review the entire plan; do not apply a fresh state to recreate installed infrastructure. Argo CD manages application resources; avoid giving Terraform ownership of the same resources.

## Migration performed

1. Assigned node .178 and service VIP .179, updated DNS, API certificates and bootstrap configuration.
2. Provisioned Ubuntu nodes .181 and .182 with the same authorized public SSH keys and joined a three-member control plane.
3. Backed up etcd, Kubernetes configuration, Flannel resources and existing Prometheus/Grafana data.
4. Staged Cilium with its separate pod pool and VXLAN port, migrated nodes individually, then verified every active non-host-network pod used the Cilium range.
5. Changed Cilium bootstrap to local APIs and enabled network policies after a positive/negative traffic canary.
6. Removed the Flannel daemonset. Legacy backup resources remain available for recovery.
7. Added health-checked API routing, Traefik replicas and the Argo CD HA profile while preserving authentication secrets.

Backup artifacts for this migration are under `/root/platform-upgrade-20261015` on .178. They contain sensitive Kubernetes configuration and must remain root-readable only. Copy backups to protected off-cluster storage and test restoration independently.

## Maintenance

Check nodes, etcd health, Cilium status, application readiness, API readiness and public routes before draining one node. Check disruption budgets; migrate only one etcd member at a time. Before monitoring pod or node maintenance, verify all monitoring PVCs are Bound and their Longhorn volumes are healthy. Longhorn's three replicas support availability across Kubernetes nodes but are not an off-cluster backup; scheduled off-cluster monitoring backups are not configured.

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
