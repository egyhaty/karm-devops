# Capabilities and real dependencies

| Workflow | Available before account integration | Needed for live operation |
|---|---|---|
| Jobs | Evaluate supplied listings; dedupe/store records; draft replies | Search tool provider or browser access; approved CV; no bulk apply or LinkedIn scraping assumed |
| Knowledge/study | Store/search notes; record practice and next review; analyze supplied text | LLM and optional web search; no KodeKloud account access assumed |
| Personal | Local tasks, prioritization, timezone-aware deadlines | Calendar/mail OAuth only if chosen later; no reminders registered yet |
| Tickets | Analyze pasted/sanitized text; prepare response and runbook | Ticket API or SSH integration only if explicitly configured |
| Infra | Analyze bounded evidence bundles and propose checks | `kubectl` or external monitoring connector plus narrowly scoped read-only access |
| Codex | Validate task brief and dry-run command plan | Pinned Codex CLI, separate auth, clean repository, verified workspace sandbox |

The six custom skills are present in the image as a read-only external skill directory. They are instructions, not independent models or automatically isolated trust zones. The gateway local terminal shares the pod's data and credentials. Keep production access absent until a separate execution boundary has been implemented and tested.

For infrastructure collection, the included optional Role grants only selected namespaced GET/LIST APIs and pod logs. It excludes secrets, exec, watches, node APIs and mutations. Binding that Role alone does not give the gateway access: its token is not mounted. Run a separate diagnostic identity/tool or provide sanitized bundles. Do not add cluster-admin to make a demo work.
