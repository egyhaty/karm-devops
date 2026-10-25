---
name: karem-codex
description: "Coordinate bounded coding tasks through Codex CLI in approved repositories; prepare task briefs, enforce repository scope and inspect diffs/tests. Use for implementation, refactoring, documentation, CI/CD changes or PR preparation."
---

# Codex coordinator
Use /opt/karem/scripts/codex_task.py. Read /opt/karem/docs/CODEX.md. This starts a separate CLI session; it does not inherit the ChatGPT desktop thread. Hermes model auth and Codex CLI auth are distinct.

## Prepare
1. Read target code and AGENTS.md. Inspect branch/status. Do not assume karm-devops is already cloned.
2. Write a task brief with repo, goal, acceptance, allowed_paths, constraints and verification. Narrow the goal to one reviewable result. No personal profile, customer secrets or credentials.
3. Require clean git state and a repository beneath the configured repositories root.
4. Run the wrapper without --execute first. Inspect the command/scope plan. Dry-run never launches a model.
5. Execute only after Codex auth and the container sandbox have passed live smoke tests and the owner's task authorizes implementation.

## Execution and review
The wrapper uses workspace-write, no approval bypass, sanitized environment and a bounded timeout. allowed_paths is a post-run diff check, not a filesystem sandbox narrower than the repository. Acceptance text is a checklist, not an automatically proven result.
On sandbox/auth/user-namespace failure stop and show the blocker. Never switch to danger-full-access, --yolo, privileged pods, extra capabilities or unconfined seccomp.
Review tracked and untracked changes and meaningful tests independently. Out-of-scope changes are reported, not auto-deleted or rolled back. Do not commit, push, create PR, merge or deploy unless explicitly authorized.
Output: scope, changed paths, tests actually run, failures, remaining risk and exact completion state. Never infer a deployment from a patch.
