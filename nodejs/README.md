# Makan property application

A practical Node.js/Express portfolio application: browse and filter fictional Cairo homes, open a property, submit a viewing request, and manage requests from an agent workspace. PostgreSQL persists listings and requests across app replicas and restarts. Local architectural SVG illustrations are included; they are not property photographs.

## Local run

Requires Docker with Compose. From `nodejs/`:

```sh
cp .env.example .env
# Replace both placeholders in .env. Use random values, a token of at least
# 32 characters, and a URL-safe database password for the example URL.
docker compose up --build -d
```

Open `http://localhost:3000/`. Use sample contact details. Open `/admin.html` and enter the local `ADMIN_TOKEN` to see viewing requests, update their status and add listings. The token remains in tab memory and is cleared on refresh or locking. It is an operator credential, not a learner account or a public signup flow. Use HTTPS when deployed and rotate the token through the Kubernetes Secret. Public visitors can browse and request viewings without it.

Compose uses a single local database owner for simplicity. The Kubernetes database bootstrap creates a separate restricted application role. Neither environment sends email or SMS, provisions infrastructure, accepts payments, or contacts a real broker.

`docker compose down` retains the volume. `docker compose down -v` deliberately deletes the local database. PostgreSQL initialization and fictional seed insertion are serialized by a database advisory lock, so concurrent application starts do not race. Existing properties are never overwritten by the seed.

## API

- `GET /api/properties`: `q`, `location`, `type`, `maxPrice`, minimum `bedrooms`, and `sort` (`featured`, `price-asc`, `price-desc`); up to 100 matches.
- `GET /api/properties/:slug`: one listing.
- `POST /api/properties/:slug/inquiries`: JSON `name`, `phone`, optional `message`; returns a reference and `new` status. At most three requests per normalized phone number per hour, shared across replicas.
- `GET /api/admin/inquiries`: latest 100 requests, with contact details; administrator bearer token required.
- `POST /api/admin/properties`: title, location, type, whole EGP price, bedrooms, area in m² and description; administrator token required.
- `PATCH /api/admin/inquiries/:id`: JSON status `new`, `contacted` or `closed`; administrator token required.
- `GET /healthz`: process alive. `GET /readyz`: database reachable.
- `GET /api/version`: image version. `GET /metrics`: Prometheus metrics, including request counts/durations and accepted viewing requests.

Only supported locations (`New Cairo`, `Sheikh Zayed`, `Maadi`) and types (`apartment`, `villa`, `studio`) are accepted. Contact details and administrator tokens are not written to request logs. Every response has a generated request ID; metric labels use bounded route templates. There is no public inquiry lookup endpoint.

This is a portfolio MVP. The shared operator token is suitable for a small controlled demo; individual agent identities, photo uploads, listing editing, pagination beyond 100 results, contact retention controls and stronger abuse protection are subsequent work. The per-phone limit is not comprehensive bot protection. Back up PostgreSQL and test restoration before treating it as a real client system.

## Kubernetes

The existing shared Helm chart and Node application remain in use. `charts/values-node.yaml` enables a dedicated PostgreSQL StatefulSet with a Longhorn PVC, private database Service, restricted application role and network rules. The app's readiness probe uses `/readyz`; liveness remains `/healthz`.

A SealedSecret for `nodejs-property-secrets` in `default` is prepared in `sealed-secrets/default/nodejs-property-secrets.yaml`, encrypted with the repository public certificate. Its generated operator credentials are stored locally in the ignored `.backup-recovery/makan-credentials.env` file with mode 0600. Keep that file in your normal secure credential store. The secret has four keys:

- `postgres-password`: database bootstrap administrator password.
- `app-db-password`: password for the restricted `makan` role (use URL-safe random characters).
- `database-url`: `postgresql://makan:<app-db-password>@nodejs-postgres:5432/makan`.
- `admin-token`: independent random value of at least 32 characters.

Use the existing Sealed Secrets workflow. Never commit a plaintext Secret or a real connection string. Do not reuse the learning platform database credentials. The deployment cannot start until the Sealed Secrets controller has reconciled this secret. The controller must have the private key corresponding to the repository certificate. No live reconciliation was performed during local development. Password changes on an existing PostgreSQL volume also require a database role password rotation; changing a Secret alone does not change database passwords.

The image tag remains controlled by the current promotion workflow. No new image is deployed by editing these source files locally. NetworkPolicy permits only the Node workload to reach its database. Longhorn PVC labels opt it into the existing daily backup job; this application has not yet had an independent restore drill. The database is a single PostgreSQL instance on replicated storage, not a PostgreSQL HA cluster.

## Verification

```sh
npm ci
npm test
# Integration checks against a separate disposable PostgreSQL database:
TEST_DATABASE_URL=postgresql://... npm run test:integration
```

Integration checks create and modify data; never point them at a database you need to preserve. CI starts a disposable PostgreSQL container, runs them, starts the application image, submits a viewing request and checks readiness and metrics. For a local learning exercise see `golang/content/lessons/docker.md`.
