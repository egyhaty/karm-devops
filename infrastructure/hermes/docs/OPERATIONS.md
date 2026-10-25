# Kubernetes operation — preparation only

Hermes and Codex are intended to run on the Kubernetes cluster, not on the Mac. The Mac/workspace is only authoring these source files and running offline checks. No local agent installation is required.

## Image and version gate

The reviewed Hermes source is locked in `upstream.lock.json`. The custom Dockerfile expects the official image contract from that review: `/opt/hermes/.venv/bin/hermes`, UID/GID 10000, `/opt/data`. It bypasses upstream root/s6 bootstrap with a custom non-root bootstrap, and uses an explicit foreground `hermes gateway run` command. This path requires an actual container startup test; static checks cannot prove compatibility.

Build on the cluster's build infrastructure or CI, not by installing an agent on the Mac. Obtain a trusted official `nousresearch/hermes-agent` digest matching a reviewed release/revision. Inspect image provenance and architecture before selecting it; no digest is guessed here. Choose a fixed Codex package version. Build from project root:

```sh
docker build -f container/Dockerfile --build-arg HERMES_BASE_IMAGE=nousresearch/hermes-agent@sha256:ACTUAL_DIGEST --build-arg CODEX_VERSION=ACTUAL_FIXED_VERSION -t YOUR_REGISTRY/hermes-karem:REVIEWED_VERSION .
```

This is a template, not an executable-ready build command. Push through existing CI/registry tooling and record the resulting custom image digest. Version pinning prevents accidental drift; it does not substitute for vulnerability review or the live sandbox test. No workflow in this kit builds/pushes automatically.

## Configuration and credentials

Fill a private copy of `config/deployment.example.json` with the image digest, actual provider/model, timezone, namespace and storage choices. Model availability and billing must be checked when selected. This kit does not assume unlimited use of a ChatGPT subscription. Provider spend limits are the actual financial cap; `max_turns=30` is only a per-task iteration guard.

The owner profile is mounted separately from Secret `hermes-profile`, key `profile.json`, at `/etc/karem-private/profile.json`. Use the original private handoff profile, never the example, to populate it. It is excluded from git and the image.

Required credential Secret keys: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USERS` (positive numeric owner IDs, comma-separated). Add only the chosen provider's documented credential keys. Telegram home channel can be set later for approved scheduled reports. Do not send tokens in chat, commit them, or include them in rendered manifests. Use the cluster's existing secret-management route. Do not populate placeholder secrets.

Codex uses a separate login under `/opt/data/codex-home/.codex`; see CODEX.md. Google Workspace, ticket APIs, SSH, cloud and Kubernetes access are not connected by this kit.

## Render and review

Run `python3 scripts/render.py --settings /private/settings.json --out build`. The output is one Kubernetes List. Before applying, verify target kube context, namespace, Secret existence, image architecture/digest, PV provisioning and backups. Server-side dry-run and schema validation require the real cluster. The manifest starts with replicas zero; no agent runs until scaled intentionally.

The initial spec uses one replica at activation, Recreate rollout, a 20Gi RWO PVC by default, non-root UID 10000, dropped capabilities, RuntimeDefault seccomp, read-only root filesystem and no service account token. `/tmp` and `/opt/data` are writable. No hostPath, privileged mode, Docker socket, service, dashboard port or Ingress is created. Telegram uses outbound polling.

The ingress-deny NetworkPolicy needs a CNI that enforces policies. Flannel alone may not enforce it. Egress remains allowed for model and Telegram access; the policy is not an exfiltration firewall. If strict egress is required, design a provider-aware proxy/egress policy against actual cluster networking.

## Persistence and rollout

Do not run multiple pollers with the same bot token or two writers on the same SQLite PVC. Use replicas one. RWO does not itself guarantee a single process; Recreate and operational discipline matter. With node-local storage, rescheduling may require the original node; it is not automatic HA. Confirm PV affinity/reclaim policy and storage failure behavior.

Bootstrap refreshes managed config.yaml/SOUL.md at every start. Edit their source/rendered ConfigMap, not runtime copies. Initial USER.md is seeded only if absent. User memories, sessions, OAuth refresh state, records and code workspaces are preserved. External project skills are read-only in the image; self-created runtime skills remain mutable data. Review new skills before using privileged workflows.

The readiness probe checks the foreground process only. It does not verify Telegram, provider access or task success. Live acceptance must send an authorized message, reject an unauthorized ID, inspect bounded/redacted logs and run a restart/persistence test. Avoid aggressive liveness restarts during long tasks.

## Backup and restore

Before changing images or storage: scale down to zero and wait for the pod to terminate, then snapshot/back up the full PVC using the cluster's existing backup system. Encrypt and restrict backups: they contain OAuth tokens, sessions and personal data. A raw live copy of SQLite/sidecars is not a consistent full backup. Record image digest and rendered config version alongside the backup. Set retention based on the owner's choice; no backup job is registered here.

Restore into a separate PVC with no running gateway, preserve UID/GID access, then test state and credentials with only one bot poller. Restore tests must not cause duplicate external deliveries. Rollback requires the old image and a compatible state snapshot; rolling the image alone cannot undo a DB migration.

## Activation gates still open

- Select actual base image digest, Codex version, provider/model and spend cap.
- Build and scan custom image; verify non-root/read-only startup and imported dependencies.
- Confirm Hermes configuration/toolsets against that exact image; no auth or scheduler JSON guessed.
- Verify Telegram allowlist, model call and quota behavior.
- Verify Codex workspace sandbox without privilege expansion. If incompatible, design a separate worker.
- Verify target storage/CNI and a full backup/restore.
- Run the model behavior cases in ACCEPTANCE.md.

Only after these gates should the Deployment be scaled to one. Preparing all six workflows is not evidence that all external integrations are already connected.
