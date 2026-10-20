# Reference authoring

The platform tour remains in `web/course.html`. This directory contains deeper, independent reference lessons in English, with an Arabic takeaway per lesson. The initial release includes Docker, Git and Cilium/NetworkPolicy; the library labels other tracks as work in development.

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
