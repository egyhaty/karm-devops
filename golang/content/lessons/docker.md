## The problem

“It works on my machine” usually hides a difference: runtime version, installed packages, environment variables or file paths. An image packages the application and its runtime filesystem. A container starts a process from that image with isolation and resource controls. It shares the host kernel; it is not a small virtual machine with its own kernel.

Our goal is specific: build the Makan property service once, run it locally, then deliver that same image through CI and Argo CD. PostgreSQL holds the listings and viewing requests outside the application container. Replacing an application Pod must not erase a viewing request.

## In this repository

Open `nodejs/Dockerfile`, `nodejs/.dockerignore`, `nodejs/package-lock.json` and `nodejs/compose.yaml`. The Docker build context is `nodejs/`, not the repository root. These paths are relative to the repository checkout.

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force && rm -rf /usr/local/lib/node_modules/npm
COPY --chown=node:node . .
ENV NODE_ENV=production
ENV APP_VERSION=dev
USER 1000:1000
EXPOSE 3000
CMD ["node", "index.js"]
```

`FROM` chooses the runtime and base filesystem. This tag can move when its publisher updates it; a digest identifies immutable image content. CI gives our own application image a commit-based tag. Check the workflow rather than assuming a tag alone proves what is inside.

`WORKDIR` makes `/app` the working directory for following instructions and the startup command. `COPY package*.json` brings the dependency manifest and lockfile in before the application source. `npm ci` installs from that lockfile and fails if the manifest and lockfile disagree. `--omit=dev` leaves development packages out of the installed runtime dependencies.

Copying source later matters: a source edit can reuse the dependency-install cache. A lockfile edit invalidates that dependency step and the following steps. A cache is an optimization; the lockfile is the dependency record. Deleting npm from this image reduces runtime tooling, but it is not a substitute for vulnerability scanning or patching the base image.

`.dockerignore` keeps local dependencies, repository metadata and local environment files out of the build context. A secret copied into an image can survive in image layers even if a later instruction deletes it. Supply runtime secrets at runtime; do not add database URLs or administrator tokens to the Dockerfile.

`COPY --chown` controls ownership of application files. `USER` starts the service without root privileges. `EXPOSE` records the intended port; it does not publish a host port. The JSON form of `CMD` starts Node directly, so it can receive termination signals and close its HTTP server and database pool.

### Why not use a multi-stage build here?

This service runs plain JavaScript. There is no transpiled bundle or native application binary to copy out of a compiler stage. A single runtime stage is reasonable. Compare `golang/Dockerfile`: Go compiles in a builder stage, then the final image receives the executable and static web assets without the compiler. Add stages when they separate real build requirements, not simply to make every Dockerfile look the same.

### The data path

```text
Browser → published host port → Node container :3000
                                    ↓
                              PostgreSQL :5432
                                    ↓
                              named data volume
```

Inside Compose, the database hostname is the service name `database`. `localhost` inside the Node container means that Node container, not PostgreSQL and not your laptop. In Kubernetes, a Service provides the database hostname instead. The same application reads a different `DATABASE_URL` in each environment.

## Lab

Use a local checkout and Docker with Compose. This lab starts only local containers. From the repository root:

```sh
cd nodejs
cp .env.example .env
```

Edit `.env` and replace both placeholders. Use a password manager to generate a database password and a random administrator token of at least 32 characters. For this local URL, use a URL-safe database password. Do not commit `.env`.

```sh
docker compose up --build -d
docker compose ps
curl -i http://127.0.0.1:3000/healthz
curl -i http://127.0.0.1:3000/readyz
curl -s http://127.0.0.1:3000/api/properties
```

Expect both health checks to return HTTP 200. The catalog contains six fictional homes on a new database. Open the site, filter by Maadi, open a home and submit a viewing request using sample contact details. Open the agent workspace and use your local administrator token to see the stored request. Change its status to `contacted`.

### Prove persistence rather than assuming it

```sh
docker compose restart app
```

Refresh the agent workspace and unlock it again if needed. The request and its status should still exist. The app process was replaced; the data stayed in PostgreSQL. A browser success message alone is not evidence of durable storage.

```sh
docker compose stop database
curl -i http://127.0.0.1:3000/healthz
curl -i http://127.0.0.1:3000/readyz
```

The existing Node process should remain alive, so liveness stays 200. Readiness should fail with 503 because the database cannot answer. A live process cannot necessarily serve business requests. Kubernetes should stop sending normal traffic to an unready Pod, rather than continually restarting it for an unavailable dependency.

```sh
docker compose start database
curl -i http://127.0.0.1:3000/readyz
```

Retry readiness after the database starts. Expect recovery without rebuilding the application.

### Observe the build cache

```sh
docker build --progress=plain -t makan:lab .
docker build --progress=plain -t makan:lab .
```

The second build should reuse unchanged steps. Edit a visible sentence in `web/index.html`, rebuild, and identify the first invalidated step. Dependency installation should remain cached. Undo only your sentence edit afterward; do not discard unrelated local changes.

### Intentionally publish the wrong port

Temporarily change only the app port mapping in `compose.yaml` to `127.0.0.1:18080:9999`, keeping the valid database configuration. Recreate the app:

```sh
docker compose up -d app
curl --max-time 3 -i http://127.0.0.1:18080/healthz
docker compose logs --tail=30 app
```

Expect the HTTP request to fail even though the app can start. The process listens on 3000; publishing 9999 forwards to a port with no listener. Restore `127.0.0.1:3000:3000` and recreate the app. Change one variable at a time when diagnosing a real incident.

### Inspect runtime evidence

```sh
docker compose exec app id
docker compose exec app sh -c 'tr "\0" " " < /proc/1/cmdline'
docker compose logs --tail=30 app
curl -s http://127.0.0.1:3000/metrics
```

The user should be non-root and process 1 should run Node. Request logs contain a generated request ID and route, without contact details or tokens. Metrics use route templates rather than property slugs or request IDs, keeping the number of label combinations bounded.

### Cleanup

```sh
docker compose down
```

The named database volume is retained. Use `docker compose down -v` only when you intend to delete this lab's database, including viewing requests. A volume is persistence, not a backup. A separate backup and a tested restore address a different failure.

## Troubleshooting

| Symptom | First evidence | Likely next check |
| --- | --- | --- |
| Image fails to build | First failing Docker build step | Lockfile consistency, registry access, build context |
| App exits at startup | App logs and required configuration | Database health, URL and administrator token length |
| Health works, catalog fails | Readiness and HTTP status | Database connectivity and initialized schema |
| Connection refused from laptop | Published mapping in Compose | Host port versus actual container listener |
| New file is absent | Rebuild output and running image | Build context, ignored files, old container |
| Request disappears after restart | Database volume and target database | Whether you recreated the volume or connected to another database |

Do not print `.env`, dump container environments into a ticket, or paste connection strings into public logs. You can verify whether configuration is present without exposing its value.

## Verify your understanding

1. Explain why `EXPOSE 3000` alone does not let your browser reach the app.
2. Show which build step reruns after a source edit and explain why the dependency step can be reused.
3. Demonstrate a viewing request surviving an app restart.
4. Demonstrate liveness succeeding while readiness fails during a database outage.
5. Explain why three application replicas need one shared database rather than three in-memory request lists.

Evidence to keep: build output, HTTP status codes, and a redacted request reference before and after restart. You have completed the lab when you can reproduce and explain these outcomes, not when you have copied all the commands.

## Arabic takeaway

الـ Image بتجهز التطبيق، والـ Container بيشغّله. الداتا مكانها قاعدة بيانات مستقلة. اتأكد من الفرق بين البورت المنشور وبورت التطبيق، وبين العملية الشغالة والخدمة الجاهزة، واثبت إن الطلب فضل موجود بعد إعادة التشغيل.

## Sources

- [Docker build cache](https://docs.docker.com/build/cache/)
- [Dockerfile reference](https://docs.docker.com/reference/dockerfile/)
- [Docker Compose networking](https://docs.docker.com/compose/how-tos/networking/)
