# Repository review — 25 October 2026

This review inspected selected upstream source and documentation. It is not a security audit or a benchmark of model intelligence. Commit pins and inspected paths are in `upstream.lock.json`. No community pack was blindly installed.

| Repository | Relevant evidence | Decision |
|---|---|---|
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | Real Dockerfile/build workflow, configuration source/example, gateway command, bootstrap scripts and bundled Codex skill | Primary runtime. Extend a reviewed official image digest, with original project-specific skills and tools |
| [moonlight-lupin/agent-skills](https://github.com/moonlight-lupin/agent-skills) | Deep-research evidence/claim/citation validation; scheduled-summary SQLite/files readers; Hermes log time-window helper | Good candidates for selected later additions; source inspected, upstream tests not run, no dependency vendored |
| [ZeroPointRepo/awesome-hermes-skills](https://github.com/ZeroPointRepo/awesome-hermes-skills) | A directory of ecosystem tools/skills | Discovery aid, not a tested runtime or an install-all recommendation |

## Findings that changed the design

- The official Codex skill provides a real CLI delegation path but also suggests a sandbox bypass for some gateway environments. This package uses an original bounded wrapper and stops on sandbox failure instead.
- The inspected official Docker image now uses root/s6 initialization before dropping to UID 10000. A non-root Kubernetes pod cannot simply assume that default entrypoint works. This project deliberately replaces it with a small bootstrap. It still needs an actual image build/startup test.
- Hermes stores managed settings, memory, auth, skills and sessions under its data home. The PVC must preserve all of those, not just the skills directory.
- The community log skill documents that its generic parser misses comma-millisecond Hermes timestamps; the dedicated window helper addresses that format. Do not assume every community analyzer's --since works for every input.
- The community research validation code offers useful deterministic evidence/citation checks, but lexical support checks are not proof that a claim is true. Human/model source assessment is still necessary.
- The scheduled-summary helper reads best-effort optional data sources. A digest must name sources skipped or unavailable instead of claiming it summarized everything.

## Adoption policy

Start with the six original project skills. Keep community helpers as reviewed candidates until an actual workflow requires them. If adding one: inspect its scripts/dependencies/license, pin its revision, test a realistic fixture, document credential/egress requirements and record how updates are reviewed. Stars and “production-grade” labels are not acceptance criteria.

No third-party implementation is copied into this deliverable. Original project code is licensed in LICENSE. Runtime and subsequently installed packages retain their own upstream licenses. The source checkout could not be cloned from this host due to DNS restrictions; selected source was read through the connected GitHub interface instead.
