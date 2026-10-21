## Learning objectives

Write OIDC audience/subject conditions, distinguish an unprivileged PR job from a privileged environment job and defend the integrity of a reviewed Terraform plan. Explain why an identity-token permission alone is not deployment authorization.

## Prerequisites

Use a new lab repository, not this repository's active deployment workflows. A sandbox administrator must create/import the GitHub OIDC provider and role. Choose a read/plan-only role initially; provider reads and backend writes for locking need distinct scoped permissions. A later apply role needs resource-specific creation/deletion and constrained PassRole permissions. Never use account-wide AdministratorAccess as the sample's default.

## The problem

A long-lived access key in repository secrets can be exfiltrated and reused elsewhere. GitHub OIDC exchanges a short-lived job identity for an STS session. The AWS role trust must verify the token audience and a narrow subject. A branch subject differs from an environment subject; if a job uses environment `cloud-lab`, trust that environment subject and protect its branches/reviewers in GitHub. Environment names alone do not enforce human approval.

An authenticated pipeline can still execute malicious Terraform. Providers, modules and external data programs are executable code. Do not run an untrusted fork PR with a deploy role, a writable state backend, or `pull_request_target` checkout of attacker code. Keep ordinary PR formatting/tests credential-free; run privileged plan only on reviewed refs, then require approval for apply.

## In this repository

`golang/content/labs/pipelines/aws-plan.yml.example` is an inert example copied manually into a separate sandbox repo. It is outside `.github/workflows/` here, so adding this course cannot trigger a cloud deploy. The current application build/GitOps workflows stay unchanged.

## Lab

Write the trust condition using your own account and a separate repository. This is a policy fragment for a role whose federated principal is the account's GitHub provider:

```json
{
  "Effect": "Allow",
  "Principal": {"Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"},
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub": "repo:OWNER/SANDBOX_REPO:environment:cloud-lab"
    }
  }
}
```

Replace all placeholders. Configure the GitHub environment's allowed deployment branch and required reviewers before granting the role. If your GitHub plan cannot enforce the intended reviewer feature, use a manual controlled alternative and record the limitation rather than claim protection exists.

Copy and read the example, pin action references to audited commit SHAs before using it for privileged jobs, then set repository variables for the sandbox region/state bucket and environment role ARN. The job requests `id-token: write` and `contents: read`, calls `configure-aws-credentials`, prints only `get-caller-identity`, initializes the backend and produces a plan. No `apply` step is included.

Validation exercise: run the plan job in the permitted environment, then intentionally change the role trust's subject to a different sandbox environment. Re-run and confirm federation is denied before Terraform can access AWS. Restore the exact condition. Do not display the OIDC token or STS credentials in logs. Capture only job identity, STS ARN and sanitized error code.

Design an apply workflow on paper: it must bind the approved commit, Terraform/provider lockfiles, state key, exact saved plan checksum, approval decision and apply identity. A second fresh plan is not the reviewed saved plan. Prefer short-lived restricted plan artifacts or regenerate/review close to deployment if secure artifact handling is unavailable.

## Validation

Pass criteria: no AWS access keys in GitHub secrets; exact `aud` and `sub` matching; disallowed environment fails; allowed job shows the expected assumed role; PR checks cannot assume it; no cloud apply step executes. A plan-only job still needs network access and read permissions and may expose data through plan output, so do not publish sensitive logs.

## Troubleshooting

| Symptom | Check | Fix |
| --- | --- | --- |
| Cannot get OIDC token | Job permissions and context | Enable id-token only for intended job |
| STS rejects token | Provider URL/audience/subject and environment use | Match exact claims; don't wildcard the organization |
| STS works, Terraform fails | Service permissions, backend, PassRole constraints | Separate trust success from resource authorization |
| Approval bypass | Actual environment protections and branch rules | Configure protections outside YAML |

Use job-level concurrency keyed by environment/state to reduce conflicting writers, while retaining backend locks as the authoritative state protection. Keep cloud sessions short and use meaningful session names for audit correlation.

## Cleanup

Disable/remove the lab workflow in the sandbox repo. Remove role policies and the lab role once no job uses it. Delete an OIDC provider only if you created it solely for this lab and have verified no other roles reference it. Preserve the real repository's federation and workflows.

## Interview preparation

**Why is `repo:ORG/*` too broad?** A compromised unrelated repository can gain the same identity route. Scope the exact repository and protected environment/ref, then constrain role permissions and session lifetime.

**Can fork PRs run Terraform safely?** Credential-free fmt/validate with controlled dependencies is different from a privileged plan. Never grant unreviewed code deployment credentials just because the event is called a PR.

**How do you audit a deployment?** Correlate commit SHA, approved plan digest, environment decision, workflow run and CloudTrail STS session. A green build without provenance does not answer who changed what.

## Verify your understanding

Explain branch versus environment subjects and demonstrate a deliberate trust failure in the sandbox. Present a sequence diagram from GitHub job token to STS session to backend/resource authorization. Label the example as plan-only.

## Arabic takeaway

الـ OIDC بيلغي المفاتيح الثابتة لكنه محتاج trust ضيقة ومراجعة للكود. افصل PR checks عن jobs اللي معاها صلاحيات، واحمِ environment فعلًا. نجاح STS مش معناه إن permissions أو الموافقة على النشر صح.

## Sources

- [GitHub OIDC in AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
- [AWS GitHub federation role](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html)
- [Configure AWS credentials action](https://github.com/aws-actions/configure-aws-credentials)
