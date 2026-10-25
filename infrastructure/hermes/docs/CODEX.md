# Codex coordination

The wrapper prepares or executes a separate Codex CLI run. It does not attach to Codex Desktop or import this conversation. Verify flags against the pinned CLI before activation. The official Hermes Codex skill was inspected as a reference; its suggested sandbox bypass is deliberately not adopted.

Example brief (paths refer to the Kubernetes PVC):

```json
{
  "repo": "/opt/data/repos/karm-devops",
  "goal": "Add a practical AWS IAM lesson following existing course conventions",
  "acceptance": ["Use current course navigation", "Include a least-privilege exercise", "State lab cleanup"],
  "allowed_paths": ["docs", "courses"],
  "constraints": ["Inspect actual repository layout and replace these example path scopes before execution"],
  "verification": ["Run the relevant existing checks and report actual results"]
}
```

```sh
python3 /opt/karem/scripts/codex_task.py --brief /opt/data/workspace/brief.json
```

Default is dry-run. `--execute` is explicit. The wrapper refuses dirty repositories and paths outside `/opt/data/repos`, uses no shell interpolation, limits runtime, removes unrelated credentials from the child environment and reports paths changed. It never automatically commits, pushes or retries with a weaker sandbox.

Authenticate the selected CLI later with `HOME=/opt/data/codex-home CODEX_HOME=/opt/data/codex-home/.codex codex login` using the installed version's supported flow. Keep CLI credentials private on the PVC. Hermes's provider login is separate. This package does not promise that a ChatGPT subscription includes any particular third-party integration, quota or model.

Limitations: a path allowlist is a post-run check, not an enforced subdirectory filesystem boundary. The repository itself is writable within Codex workspace sandbox. Git configuration or malicious repository code can create side effects; review it before running. The wrapper detects ordinary HEAD/branch changes but is not a complete security broker. A read-only review or a separate uncredentialed worker is appropriate for untrusted repositories.

Some Kubernetes kernels/seccomp settings prevent Codex's workspace sandbox. Run a harmless real sandbox smoke test before enabling execution. If it fails, stop and design a compatible isolated worker; do not add privileges or use a sandbox bypass as an automatic repair.

Headless owner login: run `codex login --device-auth` inside the Kubernetes pod, with the HOME/CODEX_HOME above. Enable device authentication in the owner account if required. Never print or export the resulting auth.json. Official reference: https://learn.chatgpt.com/docs/auth . This does not authenticate the Hermes provider.
