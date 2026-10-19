# Learning platform

The Go service serves the public course and its account API. Learners can study without signing in; an account saves lesson progress across devices. Keycloak handles sign-in and PostgreSQL stores sessions, progress, and account administration. Both services run inside the Kubernetes cluster.

## Local development

The production image serves `web/` and listens on port `8080`. The API and sign-in flow need PostgreSQL and Keycloak. Run the Go checks with:

```sh
go test ./...
go vet ./...
```

To preview only the course pages, serve the `web/` directory with any local static file server.

## Accounts

Keycloak handles passwords and OpenID Connect. The Go API stores only a hash of each session token, uses a CSRF token for changes, and checks administrator access in PostgreSQL. The first platform administrator is assigned the `platform-admin` realm role in Keycloak. Later account changes are recorded in the audit table.

The Keycloak administration console is not routed publicly. Use the port-forward procedure in [the project guide](docs/PROJECT.md) for account and realm changes. The platform does not use an external mail service, so password reset emails are not enabled; an administrator can help a learner regain access.

## Deployment

The existing GitHub Actions workflow tests and builds the image. Argo CD deploys the Helm chart in `deploy/chart/`. PostgreSQL uses the cluster's Longhorn StorageClass. Database and bootstrap credentials are supplied as a SealedSecret and are not stored in Helm values.
