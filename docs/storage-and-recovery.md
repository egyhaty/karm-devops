# Storage and recovery

## Kubernetes persistent storage

Longhorn is installed by Argo CD from `argocd/apps/longhorn.yaml`; chart values are kept in `storage/longhorn/values.yaml`. Each Kubernetes VM contributes its dedicated 80 GiB virtual disk, mounted in the guest at `/var/lib/longhorn`. Longhorn uses three replicas for the default StorageClass, with replica anti-affinity so a volume's replicas land on separate Kubernetes nodes. The default reclaim policy is `Retain`.

The Longhorn UI stays internal as a ClusterIP service. Prometheus scrapes Longhorn's ServiceMonitor. This provides replicated persistent volumes for workloads, but does not make single-replica applications highly available and is not a substitute for off-cluster backups.

## External encrypted backup

The manual pre-storage migration archive is stored on the existing external SMB backup share mounted by Proxmox at:

```text
/mnt/pve/backup-e3-smb/karm-devops/manual/20261015-platform-storage/
```

The encrypted file is `pre-storage-backup-20261015.tar.age`; `README.txt` documents the contents and restore outline, and `SHA256SUMS` verifies the encrypted file. It contains an etcd snapshot, Kubernetes control-plane configuration and secrets, node inventory, and archived Prometheus/Grafana/node data. Files on the share are mode 0600. The payload is encrypted with age before transfer.

The private age identity is kept separately at `.backup-recovery/age-identity.txt` in the operator's local workspace and is ignored by Git. Keep an additional protected copy outside the workspace. Never upload the private identity beside the archive. To decrypt, use the recovery identity on a trusted machine, then inspect the tar listing before extraction:

```bash
age -d -i /secure/path/age-identity.txt \
  -o pre-storage-backup-20261015.tar \
  pre-storage-backup-20261015.tar.age
tar -tf pre-storage-backup-20261015.tar
```

An etcd snapshot is for cluster disaster recovery. Do not restore it over a running cluster; follow the Kubernetes version-specific etcd recovery procedure. PVC data also needs its own consistent backup process. This archive is a verified manual point-in-time copy; automated scheduling and restore drills are future work.
