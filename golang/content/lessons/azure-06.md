## Learning objectives

Explain Entra federated credentials, bind audience/issuer/subject to a specific pipeline context and design comparable review controls in GitHub Actions and Azure DevOps Pipelines.

## Prerequisites

Use a separate sandbox repository/Azure DevOps project. An authorized operator must create an Entra application/service principal or a supported user-assigned managed identity, the federated credential and scoped Azure RBAC. Do not create client secrets. Azure DevOps service-connection configuration and protected checks require project permissions beyond editing YAML.

## The problem

Federation replaces a reusable client secret with a short-lived identity assertion from the CI platform. It does not grant Azure access by itself: the target service principal/identity needs scoped RBAC. GitHub's issuer/subject are not Azure DevOps's issuer/subject. Copy the values issued for the actual service connection rather than adapting a GitHub trust string by guesswork.

A GitHub environment can bind a job to a subject such as `repo:OWNER/REPO:environment:azure-lab`; branch/reviewer restrictions must exist in the environment's settings. Azure DevOps workload-identity service connections have their own trust configuration, pipeline authorization and approvals/checks. Avoid 'grant access to all pipelines' unless that broad boundary is intentionally justified.

## In this repository

Read `labs/pipelines/azure-github-plan.yml.example` and `azure-pipelines.yml.example`. They are inert plan-only examples, outside the active CI directories. They use a separate state backend and do not add an apply path to the production repository. The examples use readable action versions; pin audited immutable references before privileged real use.

## Lab

GitHub path: create a sandbox environment `azure-lab`, restrict its branch and reviewers, and create the matching Entra federated credential with issuer `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange` and the exact environment subject. Assign the identity only the sandbox resource roles and backend Blob data role it needs. Put non-secret client/tenant/subscription IDs in environment variables/vars; they are identifiers, not a substitute for credential validation.

Copy the GitHub example to the sandbox repository, set its Terraform directory and state identifiers, and run it through manual dispatch after reviewing the commit. The job requests an OIDC token, performs `azure/login`, sets the Terraform OIDC variables, checks the active account and runs plan only. A local Azure CLI login is not an explanation for why a CI job can authenticate.

Azure DevOps path: create an Azure Resource Manager service connection using **workload identity federation**, scope it to the sandbox, and authorize only the intended pipeline. Use the actual issuer/subject Azure DevOps provides when configuring the federated identity. Attach approvals/checks on the service connection/environment outside YAML. Copy the example to a sandbox project and ensure Terraform is installed on its pinned runner image or trusted setup task before invoking it.

Controlled failure: change only the sandbox federated subject to a nonmatching environment/service-connection subject, re-run and capture the failed token exchange without exposing the assertion. Restore the trust and rerun. Then test a successful token exchange with an insufficient data role on a *dedicated* backend test scope to distinguish identity from state authorization. Do not remove shared organizational assignments.

## Validation

Both examples should stop after a reviewed plan, use no static client secret, report the expected sandbox subscription and reject an unintended job context. Record identity, subject, role scope, backend key, commit SHA and approval boundary. No actual resource apply is necessary to prove federation or backend access.

## Troubleshooting

| Error | Investigate | Fix |
| --- | --- | --- |
| No matching federated identity | Exact issuer/audience/subject | Use values for this CI system/context |
| Login succeeds, resource denied | RBAC scope and role propagation | Correct narrow assignment |
| Backend fails only on hosted runner | Private network/DNS reachability | Use approved runner network |
| Pipeline edits bypass approval | External checks and service-connection authorization | Enforce checks outside attacker-editable YAML |

A reviewed plan can become stale if state changes. Revalidate expected state/commit and use bounded artifact retention. A plan file may contain secrets; avoid unrestricted artifact downloads and public logs. Serialize jobs per environment/state key and retain backend locking.

## Cleanup

Disable sandbox workflows/pipelines and remove their dedicated service connections/federated credentials. Remove role assignments only for those lab principals. Delete the dedicated app/identity only after verifying no other jobs use it. Keep the production repository's current CI and cloud identity untouched.

## Interview preparation

**GitHub OIDC versus Azure DevOps federation?** Same objective—short-lived workload identity—but different token issuer/subject setup and authorization controls. Exact trust claims and scoped RBAC matter more than the platform name.

**Why put approvals outside YAML?** A contributor who can modify a pipeline should not be able to remove the only deployment gate in the same change. Resource/environment checks create an independently administered boundary.

**How do you divide plan and apply?** Credential-free checks for untrusted code; privileged plan for reviewed refs; approval bound to commit/plan/state; narrowly privileged apply and audit trail. Never equate a successful login with deployment approval.

## Verify your understanding

Explain a failed exchange and a failed backend authorization as different incidents. Present a pipeline diagram for each CI system, including the controls configured outside YAML and the absence of static secrets.

## Arabic takeaway

GitHub وAzure DevOps يقدروا يستخدموا federation من غير client secret، لكن issuer وsubject مختلفين. احمِ service connection والـ environment من برّه YAML، وافصل plan عن apply والموافقة الفعلية.

## Sources

- [Azure login with GitHub OIDC](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect)
- [Azure DevOps workload identity service connections](https://learn.microsoft.com/en-us/azure/devops/pipelines/library/connect-to-azure?view=azure-devops)
- [Azure DevOps approvals and checks](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/approvals?view=azure-devops)
