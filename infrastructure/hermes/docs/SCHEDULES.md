# Proposed schedules — not installed

| Job | Suggested timing | Sources | Bounded output |
|---|---|---|---|
| Job shortlist | Owner-selected weekdays/time in Africa/Cairo or Asia/Dubai | Saved search criteria + employer pages | Up to 5 new deduplicated jobs, URLs and gaps |
| Personal brief | Owner-selected wake time, not a fixed morning during night shifts | Open tasks and confirmed calendar | 3 priorities, conflicts, due items |
| Study review | 3 owner-selected sessions/week | Study records and due reviews | 30–60 min exercise, one weak point |
| Weekly review | Owner-selected free day | Jobs/tasks/notes/study | Completed work, pending work, next week |
| Infra digest | Only after monitoring access works | Existing alerts or bounded snapshots | New/changed actionable findings only |

Before creating any Hermes cron: confirm timezone, delivery channel, toolset, attached skill, per-run scope, source timestamps, failure behavior, and provider cap. Use a no-model precheck for empty/no-change sources when practical. Avoid an LLM loop for ordinary uptime polling; keep Prometheus/Zabbix doing that.

Do not import a guessed scheduler JSON schema. Register through the installed version's documented `hermes cron` interface and inspect `hermes cron list` afterward. Use idempotent job names and confirm no duplicate schedule exists. Jobs, calendar edits and outbound sends remain disabled in the prepared deployment's toolsets.
