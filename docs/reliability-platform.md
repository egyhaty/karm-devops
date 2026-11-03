# Karm Reliability Platform

Karm Reliability Platform is the operations layer for this on-prem Kubernetes platform. It turns cluster signals into an evidence-backed operating loop:

```text
Prometheus alerts + Kubernetes state
                ↓
        reliability collector
                ↓
   incident timeline + runbook match
                ↓
      Slack notification / Hermes
                ↓
      approval-gated remediation
```

## Product boundary

- **Karm DevOps** owns the cluster, GitOps delivery, observability, storage, and recovery primitives.
- **Reliability Platform** owns health checks, incident timelines, SLO-style signals, backup verification, and safe remediation proposals.
- **Hermes** is the operator interface for summaries, approvals, and scheduled checks.
- **Incident Investigator** remains a bounded research prototype and is not a production dependency.

The platform must remain useful without an LLM. Every alert has a deterministic check, an evidence record, a runbook reference, and an explicit action state. LLM assistance can summarize or rank evidence but cannot bypass approval gates.

## MVP slices

1. Cluster inventory and node readiness collector.
2. Prometheus alert ingestion with deduplication.
3. Backup/restore verification report for the storage workloads.
4. Incident timeline and evidence export (JSON/Markdown).
5. Slack notification with acknowledge / investigate / approve actions.
6. Hermes adapter for operator-facing workflows.

## Safety model

Read-only collection is always enabled. Mutations require a named runbook, an allowlisted action, a fresh evidence snapshot, and an explicit approval. Every action records who approved it, what changed, and the verification result.

## Portfolio walkthrough

```text
Deploy application → alert fires → collector captures evidence →
runbook is matched → Slack/Hermes asks for approval → action runs →
post-check confirms recovery → incident timeline is exported.
```

