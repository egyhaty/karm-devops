# Node.js HTTP App

This is a minimal Node.js HTTP service for DevOps practice.

## What it does

- `GET /` returns:
  - `hello world`
  - app version from `APP_VERSION` env var
- `GET /metrics` exposes Prometheus metrics

## Prerequisites

- Node.js 18+ (or newer LTS)

## Install dependencies

```bash
cd nodejs
npm install
```

## Run locally

```bash
cd nodejs
APP_VERSION=1.0.0 PORT=3000 npm start
```

## Verify

In another terminal:

```bash
curl http://localhost:3000/
curl http://localhost:3000/metrics
```

Expected from `/`:

```text
hello world
version=1.0.0
```

## First DevOps Task

Dockerize this app and run it as a container.

Acceptance criteria:

- Create a `Dockerfile` for this app.
- Build image (example tag: `node-hello:1.0.0`).
- Run container with:
  - `APP_VERSION=1.0.0`
  - host port mapped to container port
- Verify:
  - `curl http://localhost:<mapped-port>/`
  - `curl http://localhost:<mapped-port>/metrics`

Once this is verified, reach out and we will move to the next task.
