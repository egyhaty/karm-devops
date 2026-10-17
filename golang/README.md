# Go application

A small HTTP service used by the platform to exercise image builds, deployment, and Prometheus scraping.

## Endpoints

- `GET /` returns `hello world` and the value of `APP_VERSION`.
- `GET /healthz` is used by the Kubernetes probes and deployment checks.
- `GET /metrics` exposes Prometheus metrics.

## Run locally

Requires Go 1.22 or newer.

```bash
cd golang
APP_VERSION=dev PORT=8080 go run .
```

Then check `http://localhost:8080/healthz`, `/`, and `/metrics`. The Docker image is defined here. Kubernetes settings are in `charts/values-go.yaml`, rendered with the shared templates in `charts/`.
