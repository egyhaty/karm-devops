# GitOps delivery walkthrough

## Application change

Make a small change in `nodejs/` and open a pull request for review. The application image workflow currently runs when the change reaches `main`.

After merge, follow the run in [Build and Promote Applications](https://github.com/egyhaty/karm-devops/actions/workflows/automate-build-apps.yml):

1. The workflow builds the image and checks `/healthz`, `/`, and `/metrics` in a container.
2. It publishes the image tagged with the source commit and attaches provenance.
3. It updates the image tag in `charts/values-node.yaml` and `charts/values-go.yaml`.
4. Argo CD notices the new values on `main` and rolls out the workloads.
5. The post-deployment workflow checks the public app routes and, when configured, Prometheus targets.

To roll back, revert the source or values change in Git and let Argo CD apply the previous revision. The CI workflows do not run `kubectl`; Argo CD performs the cluster sync.
