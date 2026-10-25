# Local records

The store is stdlib-only SQLite at `$HERMES_HOME/workspace/assistant.sqlite`. It has no network clients, reminder delivery, cloud provisioning or email sender.

```sh
python3 /opt/karem/scripts/store.py put --file /opt/data/workspace/record.json
python3 /opt/karem/scripts/store.py list --kind job --query Linux
python3 /opt/karem/scripts/store.py list --kind task --due-before 2026-11-01T20:00:00+02:00
python3 /opt/karem/scripts/store.py history --id 1
```

Record shape: `kind`, `key`, `title`, optional `status`, `source`, `due_at`, `details`. Jobs use a listing URL as key. Other records use a stable short ID chosen by the owner/agent. Updates are full replacements of mutable fields; read the current record first to preserve existing details. History retains each version. A status is metadata, not proof an external action occurred.

Due dates must be ISO-8601 with offset. Convert a named timezone using its rules for that date; do not reuse a fixed Cairo offset year-round. An ambiguous/nonexistent local time requires clarification.

Job URL normalization removes fragments, utm_*, gclid and fbclid, lowercases the host and sorts query pairs. It preserves scheme, path case, trailing slash and meaningful query values. Different ATS mirror URLs and reposts require a separate human/agent check.

`export` writes all current records to stdout; `import --file` validates all input records first and upserts them. Export is data portability, not a full backup: it does not preserve IDs, original timestamps, history, credentials or Hermes sessions. Back up the stopped PVC for a full restore. Batch import can partially finish if a disk/database failure occurs; upserts make retries idempotent for record identity, while history records the retry.

Do not store passwords, tokens, customer PII or private mailbox text. File modes are restrictive on creation, but a process sharing the same UID/volume can read these records. Do not treat file permissions as isolation from Hermes's own local terminal.
