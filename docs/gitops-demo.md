# GitOps Demonstration

## Change

The Node.js workload replica count is set to `2` in `charts/values-node.yaml`.

## Demonstration sequence

1. Open a Pull Request containing the values change.
2. Confirm GitHub Actions passes all validation and security jobs.
3. Merge only after review.
4. Confirm Argo CD detects the new Git revision.
5. Sync the Node.js child Application.
6. Verify the Deployment rollout and two ready replicas.
7. Verify the service through Traefik and check application health endpoints.
8. Revert the commit to demonstrate rollback.

## Safety

This repository change is validation-only until the Pull Request is merged and Argo CD is configured to sync it. No cluster command is executed by CI.
