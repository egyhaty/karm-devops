# Learning refresh: first vertical slice

## Delivered locally

- A separate searchable reference library alongside the existing 13-step introductory tour. Existing tour progress IDs and account records remain valid.
- Three English Markdown references with Arabic takeaways: Docker, Git, and Cilium/Flannel/NetworkPolicy. Each includes repository files, a practical lab, expected observations, troubleshooting, recovery and sources.
- A real Node.js business workload: Makan property listings, filtered discovery, property details, stored viewing requests, and a protected agent workspace. Fictional demo listings and local architectural illustrations avoid implying a real brokerage.
- A shared PostgreSQL store for all app replicas; serialized schema/seed setup, restricted application role in Kubernetes, readiness checks, bounded metric labels, and request IDs without contact details in logs.
- Dedicated PostgreSQL storage and network policies in Helm, local Compose, CI contract/integration/smoke checks, and an encrypted application secret prepared with the repository certificate.
- The learning administrator entry `/admin` returns to the administration page after ordinary site sign-in. Identity bootstrap remains documented separately.

## Verification boundary

API contract checks and actual PostgreSQL integration tests were run locally, including simultaneous initialization, persistence across pool restarts, filtering, request status changes, and shared request limits. Browser checks covered filtering, detail pages, viewing submission, library full-text search and reference rendering. Go tests/vet and Helm lint/render checks were run. A fresh Go service and database also verified migration application, the administrator redirect, and rejection of external OIDC return destinations. Docker was not available locally, so complete image builds and container smoke checks remain CI verification. The isolated Kubernetes network lab was authored and source-checked, not executed against the production cluster.

No source was pushed and no live workload was changed. Reconciliation of the encrypted secret requires the cluster controller private key matching `pub-cert.pem`. The local operator credential file is ignored by Git and mode 0600; move it into the operator's secure credential store. Promote the application through the normal pipeline only after reviewing the deployment diff and confirming backup capacity. Test a separate restore of the new property database before making durability claims beyond the local persistence tests.

## Next content releases

The remaining full references are explicitly marked in development, including Helm, Argo CD, Terraform, Traefik/MetalLB, Linux/networking foundations, Kubernetes runtime, storage recovery and observability. The current tour is retained as the overview, not relabelled as a completed deep curriculum.
