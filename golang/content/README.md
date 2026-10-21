# Reference authoring

The platform tour remains in `web/course.html`. The reference library is the home page in `web/index.html`; the Go server redirects the former `/library.html` address to `/`. This directory contains deeper, independent reference lessons in English, with an Arabic takeaway per lesson. The public-facing Murabba Learn library includes Docker, Git and Cilium/NetworkPolicy plus seven-module AWS and Azure Cloud & DevOps tracks. It presents reusable learning paths, not a personal study profile.

## Build

Use Node.js 24:

```sh
npm ci
npm test
npm run build
```

The pinned `marked` renderer produces `../web/lessons/*.html`, downloadable Markdown in `../web/content-source/`, and the full-text `../web/library-index.json`. Commit those generated outputs with the source changes. Docker regenerates them during its content stage; CI checks that a rebuild produces no differences. Static content does not need a CMS service or database.

## Add a lesson

1. Add metadata to `catalog.json`: a stable lowercase ID, title, track, estimated minutes, level, prerequisites and summary.
2. Add `lessons/<id>.md`, using the required sections checked by `build.mjs`.
3. Use repository paths, primary documentation, reproducible commands, expected observations, a controlled failure, recovery, and cleanup.
4. Distinguish measured project decisions from possible reasons; do not invent selection history.
5. Use fenced code blocks and ordinary Markdown. Raw HTML is escaped; remote lesson images and unsafe link protocols are rejected.
6. Build, inspect the resulting page at desktop and narrow widths, and review the diff. Verify lab commands against the intended disposable environment before claiming they have been executed.

Next writing priorities: Helm (rendering and ownership), Argo CD (sync and failure recovery), Terraform (state/import/drift), Traefik and MetalLB (packet path/TLS), Kubernetes scheduling, storage restore, and observability incidents. These are not complete references in this release.

## Cloud tracks and shared learning experience

`tracks.json` defines the two tracks; ordered catalog entries use stable `aws-01`–`aws-07` and `azure-01`–`azure-07` IDs. `tracks/*.md` supplies overview text, `study-plan.md` supplies the optional three-week AWS-first plan (11 hours/week), and cloud catalog entries include two quiz questions with answer explanations. The generator adds previous/next navigation, a completion control, quiz forms, overview pages and the study-plan page. Original Markdown lessons and the 13-step project walkthrough are preserved.

Write public content for engineers with the listed prerequisites. Do not include a particular learner's certifications, country, interview date or private learning history. Public copy describes the skills and outcomes; practical prerequisites belong in each module.

`web/progress-sync.js` reuses the tour's `learning-v2-<id>` keys, timestamp merge and existing CSRF-protected progress endpoints. Migration `004_cloud_learning_progress.sql` broadens the database check without updating/deleting user or progress rows. Go validation uses the same ID set, checked by the content tests. Cloud completion is self-assessed; quizzes provide immediate feedback rather than a scored credential. Quiz answers are intentionally delivered in public HTML and are not an exam security mechanism.

`labs/` contains standalone learner-run Terraform, bootstrap/application code and inert CI examples. `labs/manifest.json` is the explicit publication allowlist. The builder publishes only those files under `web/labs/`; it never copies `.terraform`, state, plans, local tfvars or active backend files. Add reviewed lab sources to the manifest and verify generated files match. Commit provider lockfiles with lab source, and use `terraform init -backend=false -lockfile=readonly` for reproducible schema validation. To use optional Azure examples, copy to `.tf` only in a sandbox; keep activated files through the reviewed destroy.

Additional checks:

```sh
# From repository root; Python test clouds are mocked.
python3 -m unittest discover -s golang/content/tests -p '*_test.py'
# Run inside each standalone Terraform lab, with Terraform >=1.10.
terraform fmt -check -recursive
terraform init -backend=false -lockfile=readonly
terraform validate
# AWS lab only: completely mocked provider, no AWS calls or paid resources.
terraform test
# Go integration tests require TEST_DATABASE_URL pointing only at disposable PostgreSQL.
cd golang
go test -race ./...
go vet ./...
```

CI validates both labs and activates the optional Azure VMSS, Application Gateway and private Key Vault examples for schema validation only. Cloud acceptance/failover/restore exercises require learner-run paid resources and have not been executed by CI. See `docs/cloud-learning-tracks.md` for implementation boundaries and verification results.
