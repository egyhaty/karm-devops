# Integration with karm-devops

Read-only review on 25 October 2026 found:

- `argocd/app-of-apps.yaml` tracks `main`, watches `argocd/apps`, and enables automated sync, pruning and self-healing.
- `storage/longhorn` and Argo applications for Longhorn/backups exist. Their presence in the repository does not prove that live storage or backup restore is healthy.
- `sealed-secrets` exists in the repository. Use its established deployment conventions after reading its current instructions; no new private key or sealed secret has been generated here.

## Proposed path

Copy this project under `infrastructure/hermes` on a review branch, respecting the repository's current contribution instructions. Keep generated private files excluded. Build/test the image through a selected CI build path. Once the real image/provider/storage choices are reviewed, render to `infrastructure/hermes/deploy/manifest.json` and commit only that non-secret output along with the sources.

Keep `k8s/hermes.application.example.yaml` outside `argocd/apps` while preparing. It has a deliberate unresolved revision and manual sync. Set targetRevision to an actual reviewed commit before making it an active Application. The generated Deployment remains replicas zero at first. Avoid committing an example application into a parent application's watched directory.

Before rollout, verify actual kube context, Secret, StorageClass/PVC behavior, CNI enforcement, source image and live acceptance. Then introduce a reviewed child Application through the normal PR flow. Do not enable automatic pruning of the PVC or introduce an Application deletion finalizer without an explicit data-retention decision.

No change to karm-devops, branch, PR, Argo Application or live Kubernetes resource has been made during preparation. This project is currently a separate source bundle ready for review/import, not an integrated deployment.
