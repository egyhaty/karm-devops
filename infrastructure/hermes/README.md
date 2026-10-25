# Karem's Hermes Assistant

Six prepared workflows: job search, study and knowledge, personal planning, hosting tickets, infrastructure triage, and Codex coordination. This is a preparation kit, not a running or certified production service.

## What is implemented

- Six Hermes-compatible skills with Arabic example prompts and concrete output contracts.
- A local SQLite record store for jobs, tasks, notes, study sessions and incidents; history, URL deduplication and JSON import/export.
- A Codex task planner/runner that uses argument arrays, requires a clean repository, fixes workspace scope, and never retries by disabling the sandbox.
- A non-root container recipe extending a digest-pinned official Hermes image, persistent data bootstrap, and a Kubernetes renderer. Rendered Deployments have **zero replicas**.
- A repository review, capability/credential matrix, example schedules (not registered), and offline acceptance cases.

## Read first

1. `docs/PLAN.ar.md`: scope and examples in Arabic.
2. `docs/REPOSITORIES.md`: inspected repositories and exact reviewed commits.
3. `docs/OPERATIONS.md`: image preparation, credentials, backup, rollout and remaining gates.
4. `docs/ACCEPTANCE.md`: static checks versus live model evaluations.
5. `docs/GITOPS.md`: proposed integration with the existing ArgoCD repository.

## Offline checks

```sh
python3 -m unittest discover -s tests -v
python3 scripts/validate.py
```

No network, model credentials or live cluster are needed for those checks. They test the local tooling and generated configuration, not the intelligence of a model.

## Prepare for a later rollout

Copy `config/deployment.example.json` outside the repository and fill it with non-secret deployment choices. Run `python3 scripts/render.py --settings /absolute/path/settings.json --out build`. The renderer refuses unresolved values and non-digest image references. Inspect `build/manifest.json`; it is a Kubernetes List with replicas set to zero. The secret is created separately, never generated into this repository.

No installer, account connection, scheduled job, cluster mutation, job application, message, git push, or paid model request has been executed by this kit.

