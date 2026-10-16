# Node.js application

A small Express service used by the platform to exercise image builds, deployment, and Prometheus scraping.

## Endpoints

- `GET /` returns `hello world` and the value of `APP_VERSION`.
- `GET /healthz` is used by the Kubernetes probes and deployment checks.
- `GET /metrics` exposes Prometheus metrics.

## Run locally

Requires Node.js 18 or newer.

```bash
cd nodejs
npm ci
APP_VERSION=dev PORT=3000 npm start
```

Then check `http://localhost:3000/healthz`, `/`, and `/metrics`. The Docker image and Kubernetes settings are in this directory and `charts/values-node.yaml`.
