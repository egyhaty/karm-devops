# Storage and recovery

## Kubernetes persistent storage

Longhorn is installed by Argo CD from `argocd/apps/longhorn.yaml`; chart values are in `storage/longhorn/values.yaml`. Each Kubernetes VM contributes a dedicated virtual disk mounted in the guest at `/var/lib/longhorn`. The default StorageClass uses three replicas with hard node anti-affinity and a `Retain` reclaim policy.

The Longhorn UI is internal. Prometheus scrapes Longhorn metrics through a ServiceMonitor. Replication improves availability across Kubernetes nodes, but it is not an off-cluster backup and does not make a single-replica application highly available.

## Backup policy and current state

A manually created, encrypted migration archive was checksum-verified and stored outside the cluster. It covered cluster recovery material and monitoring data at that point in time. The archive and its decryption key are kept outside this repository; their storage locations and contents are intentionally not published.

Longhorn 1.13 supports SMB/CIFS backup targets directly. The cluster currently has no configured target or recurring backup jobs because the reachable SMB endpoint, share name and credentials have not been provisioned in Longhorn. Keep credentials in a Kubernetes Secret in the `longhorn-system` namespace; keep secret values and the external share location out of Git.

The default StorageClass does not encrypt volumes. Longhorn encrypts backups made from encrypted volumes, so encrypted backup coverage requires the monitoring PVCs to use an encrypted StorageClass and the required node-side encryption support. The intended policy is daily backups with seven-day retention, followed by a restore drill to an isolated test volume. Longhorn volume backups cover PVC contents; Kubernetes control-plane state needs a separate etcd recovery procedure. A completed backup is not proven until a restore has been mounted and verified.

## Recovery flow

```mermaid
flowchart LR
  App[Application PVC] --> Snapshot[Longhorn snapshot]
  Snapshot --> Encrypt[Encrypted volume backup]
  Encrypt --> Target[External NFS or S3-compatible target]
  Target --> Restore[Restore to isolated test volume]
  Restore --> Verify[Verify files and application startup]
  Git[Git desired state] --> Reconcile[Argo CD reconciliation]
  Etcd[Protected etcd snapshot] --> ControlPlane[Version-matched control-plane recovery]
```

Never restore an etcd snapshot over a healthy cluster. Use the Kubernetes and etcd recovery procedure matching the snapshot version. Keep decryption material separate from the backup payload and test access through the documented recovery procedure.
