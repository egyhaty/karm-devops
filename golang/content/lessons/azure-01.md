## Learning objectives

Map tenant, subscription, Resource Group and resource scopes. Explain Entra identities versus Azure RBAC, select the right management/data roles and prove your active subscription before making a change.

## Prerequisites

Azure CLI and an approved sandbox subscription are required for the live lab. Obtain the subscription ID from its owner; do not choose the first subscription shown. Your account needs Resource Group creation permissions. Role assignments require additional authorization such as Role Based Access Control Administrator at the intended scope; Contributor alone does not grant that ability.

## The problem

An Entra tenant is the identity directory; a subscription is a resource/billing boundary associated with a directory. A Resource Group is a management/lifecycle scope within a subscription, not a network boundary. A VM in one RG can communicate with a VM in another if networking permits. Policies can deny resource configurations even when RBAC allows the caller's action.

Entra directory roles manage directory objects; Azure RBAC roles authorize Azure resources. Azure RBAC evaluates assignments at scopes with inheritance, applicable conditions and deny assignments. Resource management and service data planes are separate: being Contributor on a Storage Account does not automatically authorize blob reads via Entra. Some management roles can retrieve account keys, so distinguish nominal data roles from indirect access paths.

For comparison with AWS, an Azure subscription is not a perfect synonym for an AWS account. An Entra tenant can serve many subscriptions; managed identities and federated workload identities are service identities, not human user accounts. Build a scope diagram before memorizing role names.

## In this repository

Azure lab resources live under `golang/content/labs/azure-app/`. They never touch the Kubernetes cluster or learning application's user store. The capstone creates an isolated RG and uses an explicit subscription variable. Existing OIDC sign-in for this website remains unchanged.

## Lab

```bash
az login
export LAB_SUBSCRIPTION_ID='REPLACE_WITH_YOUR_SANDBOX_SUBSCRIPTION'
az account set --subscription "$LAB_SUBSCRIPTION_ID"
az account show --query '{subscription:id,tenant:tenantId,name:name,user:user.name}' -o json
export LAB_RG="cloud-learning-$(date +%s)"
export LAB_LOCATION=westeurope
az group create --name "$LAB_RG" --location "$LAB_LOCATION" --tags Purpose=cloud-learning
SCOPE=$(az group show --name "$LAB_RG" --query id -o tsv)
az role assignment list --scope "$SCOPE" --include-inherited --all --query '[].{Role:roleDefinitionName,Scope:scope,Type:principalType}' -o table
az role definition list --name Contributor --query '[0].permissions' -o json
az role definition list --name 'Storage Blob Data Reader' --query '[0].permissions' -o json
```

Compare `actions` to `dataActions`. List the exact effective assignment that permits RG creation and identify where it was inherited. On an organization-managed account, inability to list assignments can itself require a separate permission; do not interpret an empty/denied listing as proof of no access.

Create a local table with three principals (human operator, CI identity, VM managed identity) and three tasks (create VM, read blob, read Key Vault secret). Assign the narrowest appropriate scope and role for each. Have an authorized administrator optionally grant Reader to a disposable principal at this RG; demonstrate that it can inspect metadata but cannot create resources. Record the assignment ID if you do this extension so cleanup is precise.

## Validation

The account output must match the approved subscription and tenant. The new RG should have the Purpose tag. Your role matrix must distinguish management reads from blob/secret data reads, and describe which identity can grant roles. No VM or chargeable compute is created in this module.

## Troubleshooting

| Error | Evidence | Response |
| --- | --- | --- |
| Subscription not found | Active tenant and available subscriptions | Select correct directory; request access |
| AuthorizationFailed | Caller object ID, action and scope | Find missing role at the correct scope |
| RequestDisallowedByPolicy | Policy assignment/details | Use an approved region/SKU; don't broaden RBAC |
| Role granted, access still fails | Token refresh, propagation, correct principal object ID | Retry after propagation; verify scope and data plane |

Do not solve a data-plane failure by granting Owner. For service principals, application/client ID and service-principal object ID are different identifiers. Role assignments typically target the principal object ID.

## Cleanup

Delete only optional role assignments created for this lab using their recorded assignment IDs. Then remove this empty lab RG:

```bash
az group delete --name "$LAB_RG" --yes
az group exists --name "$LAB_RG"
```

Expect `false` after deletion finishes. Never delete an RG whose inventory includes resources owned by another exercise or team.

## Interview preparation

**Why can Contributor create a storage account but fail to read blobs?** Management actions and dataActions are distinct. Check the chosen auth mode, data role, scope and network boundary; keys can introduce alternate access if permitted.

**Where should CI permissions be assigned?** At the smallest resource/RG scope needed, with a separate controlled identity for bootstrap role assignments. Subscription-wide Owner is not a default deployment requirement.

**How do you prevent deployment to the wrong subscription?** Explicit account selection, provider subscription ID, pipeline identity checks, scoped service connections and policy. Naming conventions alone do not enforce the boundary.

## Verify your understanding

Draw your tenant/subscription/RG/resource hierarchy and explain inherited roles aloud. Keep a redacted account check, role matrix and cleanup result as evidence.

## Arabic takeaway

الـ Entra tenant للهوية، والـ subscription للموارد والفوترة، والـ Resource Group لإدارة دورة الحياة. فرّق بين إدارة المورد وقراءة الداتا داخله، واتأكد من subscription والـ scope قبل أي تعديل.

## Sources

- [Azure RBAC scope](https://learn.microsoft.com/en-us/azure/role-based-access-control/scope-overview)
- [Azure roles and Entra roles](https://learn.microsoft.com/en-us/azure/role-based-access-control/rbac-and-directory-admin-roles)
- [Azure role definitions](https://learn.microsoft.com/en-us/azure/role-based-access-control/role-definitions)
