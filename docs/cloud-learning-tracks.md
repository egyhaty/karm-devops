# Cloud learning tracks

Murabba Learn presents a shared Cloud & DevOps learning library. AWS and Azure each have seven ordered modules; original Docker/Git/NetworkPolicy references and the 13-step project walkthrough remain available. The public pages have generic prerequisites and outcomes, not a personal certification profile, location or interview deadline.

## Content and navigation

- AWS: networking and packet tracing; IAM/STS/secrets; EC2/ALB/ASG/CloudWatch; RDS/S3/recovery/cost; Terraform modules/state/drift; GitHub OIDC; two-AZ WordPress capstone.
- Azure: tenant/subscription/RG/RBAC; VNet/NSG/routes/private DNS; VM/VMSS/L4/L7 ingress; Storage/Key Vault/managed identity/Monitor; Terraform/Blob state; GitHub and Azure DevOps federation; private application capstone.
- All 14 cloud modules include objectives, prerequisites, commands/configuration, validation, cleanup, troubleshooting, three interview questions/model answers, two interactive quiz questions and an Arabic summary. Encouragement appears before labs, after validation, before quizzes and between track milestones.
- The catalog has 17 lessons. Search still covers titles, summaries and full Markdown bodies; a track filter narrows the results. Ordered overview pages link to each module; lessons have previous/next links, table of contents and source downloads.
- An optional three-week AWS-first plan allocates 11 hours/week (33 total), including labs, evidence, practice, interview rehearsal and catch-up. It distinguishes static review from runtime work that requires cloud access.
- The shared teal/mint theme is preserved. Navigation is grouped, the active library/track is highlighted and account actions are separate. The project walkthrough is one learning route within the wider library.

Sources: `golang/content/catalog.json`, `tracks.json`, `lessons/`, `tracks/`, `study-plan.md`, `labs/`. Build via the existing pinned Markdown renderer; generated pages/search/downloads are committed under `golang/web/`. No new application framework or CMS.

## Progress compatibility

Existing session authentication, CSRF protection and `/api/progress` routes remain in use. Stable IDs are `aws-01`–`aws-07` and `azure-01`–`azure-07`; the three original reference IDs can now also save completion. The original `lesson-01`–`lesson-13` IDs remain valid.

Migration 004 extends the existing check constraint transactionally. It does not update/delete user, session or progress rows. The timestamp-based upsert still rejects stale overwrites. Browser progress uses the same `learning-v2-` key/event contract and now enumerates cloud/reference IDs instead of only numbered tour keys. Failed sync is visible and retains local completion for retry on reload. Track totals count modules, not encouragement cards. Completion is manual self-assessment; quizzes are formative and do not certify cloud deployment.

Do not manually downgrade the database constraint after cloud progress has been written. A rollback to an older binary can still read legacy data but will reject new cloud completion writes; plan a compatible rollback rather than deleting learner records. This change has not been migrated against any live database.

## Standalone practical files

AWS WordPress: two-AZ VPC/subnet module, per-AZ NAT, restricted-client HTTPS ALB, private EC2 ASG, encrypted EFS, private encrypted Multi-AZ MySQL, RDS-managed secret retrieval through a scoped instance role, IMDSv2, health/readiness paths and CloudWatch alarm. Requires a regional certificate, DNS control and a reviewed release/hash. Default installer ingress requires a trusted client CIDR.

AWS limitations are explicit in the lesson/README: private ALB→Apache HTTP; minimal DB client requests TLS without explicit CA/hostname verification; boot-time packages and mutable AMI lookup; master DB account for initial setup; manual credential refresh; no central guest logs, EFS backup policy, WAF/CDN or notification action. The lab is not presented as a complete production security/DR implementation.

Azure: private single VM behind internal Standard Load Balancer; explicit NAT egress; private Blob endpoint/DNS; managed-identity data access with public/shared-key access disabled; optional separate probe VM. Optional inert VMSS, Application Gateway and private Key Vault configurations provide additional practical drills. The base stack is intentionally not HA; optional gateway is private HTTP, not a claim of TLS/WAF. The Key Vault helper writes only a fixed harmless lab string and prints a version ID, never a token/value.

CI examples under `labs/pipelines/` are inert `.example` files, plan-only, and intended for a separate sandbox repository/project with exact federation claims and protected environments/service connections. No deployment job was added to this repository. Before privileged real use, pin audited action SHAs and review role/runner/backend boundaries.

`labs/manifest.json` explicitly lists downloadable source. The builder cannot recursively publish local Terraform providers, state, tfvars, active backend configurations or plan files. Provider lockfiles and mock architecture test files are included deliberately. Lab resources have no connection to root `terraform/`, Kubernetes manifests, Argo CD or the live application database.

## Verification

Local verification on 21 October 2026:

- 11 Node content/progress tests: generation, ordered catalog, legacy ID compatibility, required content/quizzes, links/download parity, publication allowlist, shell syntax, shared public copy, encouragement/module totals, local/account merge, CSRF header, complete/undo and visible sync failure.
- Go tests with race detection and `go vet ./...`: pass. With `TEST_DATABASE_URL` pointing at disposable local PostgreSQL, the integration test creates its own schema, applies migrations 001–003, seeds a legacy admin/progress record, applies 004 twice, verifies preservation, exercises cloud saves/undo/stale-write rejection and DB rejection of invalid IDs, then removes only its test schema.
- Terraform 1.10.5 fmt/init (backend disabled)/validate: AWS and Azure pass against signed AWS 6.69.1 / AzureRM 4.81.0 schemas. Optional Azure VMSS, Application Gateway and Key Vault examples validate when activated in a temporary validation directory.
- AWS mock-provider architecture test: pass. Its apply is entirely mocked, with no AWS API calls/resources. It checks private encrypted Multi-AZ RDS, two private app subnets/minimum capacity, IMDSv2 and restricted installer ingress.
- Four local Python HTTP tests: shallow health does not call cloud identity, data success returns only status, upstream denial returns 503 without leaking details, unknown paths return 404. All cloud calls are mocked.
- Redacted Gitleaks scan of staged changes: no leaks. Trivy HIGH/CRITICAL review hardens ALB invalid-header handling and Storage default-deny rules. Three resource-local exceptions document deliberate boundaries: client-restricted public HTTPS ALB, HTTPS bootstrap/SSM egress through NAT, and no trusted-service bypass on private-only Storage. Production scanner settings are unchanged.
- Existing `scripts/validate-platform.sh`: pass (52 YAML files plus topology/network/storage/availability); shell syntax and whitespace checks pass. macOS required temporary native yq and a Bash 3.2 mapfile compatibility function; the repository script was not changed.
- Browser preview: library search for private endpoints, quiz feedback, completion, persisted track count, shared public copy and refined navigation verified locally, including a 390px responsive preview. Hosted cloud failover/restore/rotation exercises have **not** been executed; schema/mock tests do not replace those acceptance drills.

CI adds the same disposable PostgreSQL/Go checks, Python contract tests and a cloud-lab schema/mock-validation matrix. Generated-output parity covers new track, study-plan and lab-download files.

No paid cloud resources were created, no production manifest/state/database changed, and no production deployment or main merge is part of this feature PR.
