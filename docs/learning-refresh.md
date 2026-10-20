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

The initial local review did not push or change live workloads. The production release recorded below subsequently published and deployed the update through Git and Argo CD. Reconciliation of the encrypted secret requires the cluster controller private key matching `pub-cert.pem`. The local operator credential file is ignored by Git and mode 0600; move it into the operator's secure credential store. Promote the application through the normal pipeline only after reviewing the deployment diff and confirming backup capacity. Test a separate restore of the new property database before making durability claims beyond the local persistence tests.

## Next content releases

The remaining full references are explicitly marked in development, including Helm, Argo CD, Terraform, Traefik/MetalLB, Linux/networking foundations, Kubernetes runtime, storage recovery and observability. The current tour is retained as the overview, not relabelled as a completed deep curriculum.

## Production release — 20 October 2026

- Source release `5b61aab` passed platform validation and all Node, Go and Keycloak image builds, smoke checks, vulnerability scans and provenance publication.
- Image promotion `a980ba5` selected `sha-5b61aab`. The encrypted property secret validated against the live controller and reconciled successfully.
- Makan deployed with three Ready application replicas and a Ready PostgreSQL instance on its bound Longhorn PVC. The learning application deployed with two Ready replicas; Keycloak also completed its rollout. Its existing manual Argo CD sync policy was preserved.
- An early post-deployment check ran against the previous application version. Fix `8686036` made checks wait for readiness, the expected image version and the reference-library route. Its platform validation and post-deployment workflow both passed, including authenticated Prometheus scrape-target checks.
- Read-only public verification confirmed the Makan image version, location filtering, ascending price sort, readiness, and HTTP 401 for the unauthenticated agent API. The learning library, Docker reference and administrator entry redirect were also checked.
- No production viewing inquiry was created: automatic approval review rejected that proposed test because it would permanently add a live record. The write workflow and persistence were verified only in disposable local/CI databases.

Public routes: `https://makan.murabba.net/`, `https://learn.murabba.net/library.html`, and `https://learn.murabba.net/admin`. The remaining deep-reference tracks are still in development.
