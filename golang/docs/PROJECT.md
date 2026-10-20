# Learning platform operations

## What runs

The Go deployment serves the public course and account API. Keycloak handles registration and OpenID Connect. PostgreSQL stores application users, hashed sessions, lesson progress, and administrator audit events. The database and identity provider run inside Kubernetes; there is no managed authentication or database service.

The Helm chart is in `deploy/chart/`. Argo CD deploys it to the `learning-lab` namespace. PostgreSQL requests a Longhorn volume. The web Service exposes port `8080`; Prometheus reaches the separate metrics port `9090` through the cluster network.

## First administrator

The public course and registration page are available without an account. Create the first platform administrator before signing in to the course:

1. Start a port-forward from a trusted workstation:

   ```sh
   kubectl -n learning-lab port-forward service/keycloak 18080:8080
   ```

2. Open `http://localhost:18080/auth/admin/` and sign in with the bootstrap administrator credentials supplied during installation.
3. Select the `learning-lab` realm, create the first learner account, and assign it the `platform-admin` realm role.
4. Sign in to `https://learn.murabba.net/` with that account. The Go service records the administrator role when it creates the account.
5. Open `/admin` or **Admin** in the site, then rotate the Keycloak bootstrap password and store the new value with the cluster credentials.

The public Ingress routes the learner realm and the `master` realm's OpenID Connect, login-action, and account endpoints, which the admin console uses to sign in and manage its account. It does not route Keycloak's administration console, admin API, or management port. Keep the port-forward open only while changing identity-provider settings.

Normal administration uses the same site sign-in. Opening `/admin` starts sign-in when needed and returns to the admin page afterward; only the allowlisted local admin destination is retained through OIDC. Keycloak port-forwarding is for identity-provider bootstrap or advanced identity changes, not ordinary account management.

After the first administrator signs in, use the site's Admin page to promote or disable accounts. The Go service checks administrator access against PostgreSQL and writes each change to the audit table. A disabled account cannot use an existing session or sign in again.

## Local checks

Run from `golang/`:

```sh
go test ./...
go vet ./...
helm lint deploy/chart
```

The image smoke test starts PostgreSQL and the Go container together. It checks the home page, health endpoint, unauthenticated API response, and the private metrics listener.

## Sign-in and account limits

The browser uses OpenID Connect Authorization Code flow with PKCE. The API validates the issuer, audience, token signature, nonce, state, and PKCE exchange before opening a session. The browser receives an opaque session cookie; only its hash is stored in PostgreSQL. Changes require a CSRF token.

Account recovery email is not configured because the platform does not use an external mail service. A platform administrator can reset a learner's Keycloak password from the administration console. A learner who can no longer sign in will need help from an administrator.

## Data and recovery

Lesson progress and accounts live in PostgreSQL's Longhorn volume. A replicated Longhorn volume helps with a node failure; it is not a separate backup. The cluster's Longhorn backup target and recurring jobs are documented in [the platform recovery guide](../../docs/storage-and-recovery.md). Restore the database to a separate volume and verify the application data before replacing a working volume.

## Reference content

The original 13 lessons remain an introductory platform tour with existing progress IDs. The reference library is the home page at `/`; the former `/library.html` address redirects there. Its English lessons use Markdown in `content/lessons/`, catalog metadata in `content/catalog.json`, and Arabic takeaway sections. Add a lesson there rather than embedding more HTML into `web/site.js`.

```sh
cd content
npm ci
npm test
npm run build
```

Generated pages, downloadable sources and the search index are committed for local static previews and checked for consistency in CI. The image build regenerates them using the pinned renderer. The reference lessons do not yet record account completion; existing progress still covers the introductory tour. Required lesson sections ensure each publication includes a problem, repository examples, a lab, troubleshooting, verification, an Arabic takeaway and primary sources.
