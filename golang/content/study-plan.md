## Your three-week sprint

Use this optional accelerated plan to turn the two tracks into a consistent study routine. Spend **11 hours per week, 33 hours total**, starting with AWS and then practicing Azure. The plan assumes familiarity with Linux, networking and Git; no certification or specific interview date is required. Allow extra time for unfamiliar prerequisites. Three weeks builds a practical foundation and an evidence portfolio, rather than mastery of both clouds. Lab durations include reading, quiz and first-run practice; retries, quota delays or certificate issuance can exceed estimates. Keep an asynchronous setup window before paid capstones.

Before week 1: obtain sandbox accounts, cost alerts, tools and permissions. Request the regional ACM certificate/DNS access early. If access is delayed, do static validation and mark cloud evidence as pending; use the protected catch-up blocks below.

## Week 1 — AWS foundations through delivery (11 hours)

| Session | Time | Work and evidence |
| --- | --- | --- |
| Monday | 100 min | [AWS 01 networking](./lessons/aws-01.html): routes, SG/NACL matrix, controlled route failure and cleanup |
| Tuesday | 85 min | [AWS 02 identity](./lessons/aws-02.html): trust versus permissions, allow/deny evidence |
| Wednesday | 95 min | [AWS 03 compute](./lessons/aws-03.html): static health/rollout review now; reserve runtime drill for week 2 |
| Thursday | 95 min | [AWS 04 data](./lessons/aws-04.html): S3 version restore and DR design; DB runtime observations later |
| Friday | 100 min | [AWS 05 Terraform](./lessons/aws-05.html): module/backend review and state security; live drift later |
| Saturday | 85 min | [AWS 06 CI/CD](./lessons/aws-06.html): narrow OIDC trust and plan-only job in separate repo |
| Sunday | 100 min | 40 min cost/quotas/certificate prep, 30 min explain the architecture aloud, 30 min catch-up |

Exit gate: draw the AWS request, credential and state paths without notes; show S3 restore, IAM decisions and safe plan handling. A static-only compute exercise is not yet failure-recovery evidence.

## Week 2 — Build AWS evidence, then map Azure (11 hours)

| Session | Time | Work and evidence |
| --- | --- | --- |
| Monday | 80 min | [AWS 07 capstone](./lessons/aws-07.html), first half: inspect inputs, cost and plan; explicit learner apply decision |
| Tuesday | 80 min | AWS capstone second half: HTTPS, WordPress post/upload and two healthy AZ targets |
| Wednesday | 110 min | Complete AWS 03 live target failure and AWS 05 tag-drift detection/reconcile; record timeline |
| Thursday | 110 min | AWS 04 recovery runbook, RPO/RTO assumptions, cost review; destroy capstone and verify inventory |
| Friday | 70 min | [Azure 01 identity](./lessons/azure-01.html): tenant/subscription/RBAC scope map |
| Saturday | 160 min | [Azure 02 networking](./lessons/azure-02.html) 85 min + [Azure 03 compute](./lessons/azure-03.html) 75 min; runtime parts in week 3 |
| Sunday | 50 min | 30 min AWS senior mock interview, 20 min catch-up |

Exit gate: show AWS runtime evidence and cleanup, explain tested recovery versus proposed DR, compare Azure identity/network boundaries accurately. Never keep paid resources running until the next weekly session by accident.

## Week 3 — Azure operation and interview synthesis (11 hours)

| Session | Time | Work and evidence |
| --- | --- | --- |
| Monday | 85 min | [Azure 04 services](./lessons/azure-04.html): identity/storage/Monitor walkthrough; defer live evidence to capstone |
| Tuesday | 80 min | [Azure 05 Terraform](./lessons/azure-05.html): provider/backend separation and lease runbook |
| Wednesday | 75 min | [Azure 06 delivery](./lessons/azure-06.html): GitHub and Azure DevOps trust/plan-only review |
| Thursday | 65 min | [Azure 07 capstone](./lessons/azure-07.html), build/validate and explicit budgeted apply |
| Friday | 65 min | Azure capstone: probe→VIP, storage identity, failure/recovery; destroy and verify |
| Saturday | 150 min | 60 min finish Azure 02/03/04 live evidence and drift within one bounded lab window if needed; 60 min AWS/Azure incident mock; 30 min evidence cleanup |
| Sunday | 140 min | 40 min design interview, 40 min weakest-topic repair, 30 min CV/project narrative, 30 min catch-up |

Exit gate: distinguish DNS, process and RBAC failures; show scoped federation designs for both CI systems; explain availability and cost choices. The Key Vault extension and full VMSS/Application Gateway deployment can become follow-on work; do not claim those were deployed if you completed only design exercises.

## Score yourself with evidence

For each module: pass the quiz, reproduce validation, explain one failure and its minimal repair, answer two interview questions without reading, and verify cleanup. Keep a redacted evidence folder outside Git: diagrams, sanitized plan summaries, request statuses, incident timestamps and a cost estimate. Never save secret values, state or plan binaries into interview slides.

Mock rubric (0–2 each): requirements, packet path, identity boundary, data recovery, rollout, incident diagnosis, cost and honest limitations. Below 12/16: use catch-up time on weak areas rather than add new services. Repeat a ten-minute failure diagnosis until you can defend each inference with evidence.

## After the sprint

Continue at 10–12 hours/week: deepen Azure VMSS/Application Gateway and Key Vault, run a separately budgeted restore rehearsal, add centralized telemetry and apply the same interview rubric. Prioritize gaps found in actual interview feedback. Service names and certification definitions cannot substitute for operating evidence.

## Arabic takeaway

الخطة 11 ساعة أسبوعيًا لمدة 3 أسابيع: AWS الأول مع مشروع ودليل تشغيل، وبعده Azure ومقارنة وتشخيص. فرّق بين اللي نفذته فعلًا واللي صممته بس، وما تسيبش موارد مدفوعة شغالة بين الجلسات.
