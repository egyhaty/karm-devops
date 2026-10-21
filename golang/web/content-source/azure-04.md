## Learning objectives

Use a VM managed identity without stored credentials, separate Blob/Key Vault data roles from management access, and explain metric, log and activity-log evidence. Design secret retrieval and rotation without embedding secret values in Terraform.

## Prerequisites

The practical runtime lab uses the Azure 07 VM and Storage Account. Azure CLI is required on your laptop; inside the VM the included Python app uses the metadata endpoint and standard library. Key Vault is a separately budgeted extension and is not silently created. Creating role assignments requires an appropriately privileged bootstrap identity.

## The problem

A system-assigned managed identity belongs to the lifecycle of its Azure resource; a user-assigned identity has an independent lifecycle and can be attached to multiple resources. Managed identity supplies an Entra token for a requested audience. It does not automatically grant authorization, network reachability or access to a secret.

Storage Blob Data Reader is a data-plane role. Key Vault Secrets User permits reading secret contents under the RBAC model; Key Vault Reader is metadata-oriented and is not equivalent. Choose one vault permission model deliberately and keep RBAC distinct from firewall/private endpoint rules. A 403 can reflect authorization or network restrictions; inspect the actual service error and the request's identity and route.

Azure Monitor is a family of facilities. Platform metrics, Activity Log (control-plane actions), resource diagnostic logs, VM guest logs and application telemetry are different data streams. A VM's stdout is not automatically in Log Analytics. Diagnostic settings, data collection rules/agents, retention and queries must be configured and costed deliberately.

## In this repository

The capstone disables shared keys and public Storage network access. It assigns the VM identity Storage Blob Data Reader on the account. The app's `/storage-check` requests an IMDS token for the Storage audience and lists the lab container; it never returns the token. No secret values or access keys are provisioned into Terraform state. The example's in-memory greeting is not a database-backed HA application.

## Lab

After deploying Azure 07 yourself, inspect identity and exact role assignment:

```bash
cd golang/content/labs/azure-app
RG=$(terraform output -raw resource_group_name)
VM=$(terraform output -raw vm_name)
SA=$(terraform output -raw storage_account_name)
PRINCIPAL=$(az vm show -g "$RG" -n "$VM" --query identity.principalId -o tsv)
STORAGE_SCOPE=$(az storage account show -g "$RG" -n "$SA" --query id -o tsv)
az role assignment list --assignee "$PRINCIPAL" --scope "$STORAGE_SCOPE" --query '[].{role:roleDefinitionName,scope:scope}' -o table
az vm run-command invoke -g "$RG" -n "$VM" --command-id RunShellScript --scripts 'curl -fsS http://127.0.0.1:8080/storage-check' --query 'value[].message' -o tsv
```

Expected response: a small JSON result with a successful storage HTTP status, without a bearer token or blob body. Allow for role propagation. The storage container is created through the provider's management path, so the learner's public laptop does not need direct private blob access for provisioning.

Use the platform metric API to examine available VM metrics and a recent Activity Log window:

```bash
VM_ID=$(az vm show -g "$RG" -n "$VM" --query id -o tsv)
az monitor metrics list-definitions --resource "$VM_ID" --query '[].name.value' -o tsv
az monitor metrics list --resource "$VM_ID" --metric 'Percentage CPU' --interval PT1M --aggregation Average
az monitor activity-log list --resource-group "$RG" --offset 1h --query '[].{time:eventTimestamp,status:status.value,operation:operationName.value}' -o table
```

Key Vault extension: have an authorized lab operator create an RBAC-enabled vault with an approved network policy, create a disposable non-production secret, grant the VM identity Key Vault Secrets User at an intended scope and access it from the VM using a token for `https://vault.azure.net`. Validate only the version ID/HTTP status in shared evidence. Rotate the secret, verify retrieval of the new version and explain app caching/reload behavior. Record vault, role assignment and private endpoint/DNS IDs for cleanup. This extension requires its own commands/configuration review against current tenant policy; no production vault is used.

### Optional private Key Vault lab

A complete inert [key-vault.tf.example](../labs/azure-app/key-vault.tf.example) creates an RBAC vault with public networking disabled, a private endpoint/DNS link and a VM data-role assignment. It does not put a secret value in Terraform. Copy it to `key-vault.tf`, set a globally unique `vault_name` in private tfvars, validate and review the added cost before any apply. Follow tenant soft-delete/purge policies.

For this disposable exercise only, set `vault_data_role = "Key Vault Secrets Officer"`, review the scoped temporary permission and apply it in your sandbox. Download [vault-check.py](../labs/azure-app/vault-check.py) and copy it to the private VM through Run Command's script transport (no token/secret in arguments):

```bash
VAULT=$(terraform output -raw vault_name)
# Azure CLI loads the local script as the Run Command script body.
# Wrapper combines a local Python file into a shell script; values are lab identifiers only.
{ printf "python3 - %s --seed <<'PYTHON'\n" "$VAULT"; cat vault-check.py; printf '\nPYTHON\n'; } > /tmp/cloud-vault-seed.sh
az vm run-command invoke -g "$RG" -n "$VM" --command-id RunShellScript --scripts @/tmp/cloud-vault-seed.sh --query 'value[].message' -o tsv
```

The script requests the Vault audience from IMDS and writes only a fixed harmless test string, then prints its version ID without a value/token. Change `vault_data_role` back to **Key Vault Secrets User**, review/apply, wait for verified role propagation, and run a read-only wrapper by omitting `--seed`. Read should succeed and `--seed` should eventually be denied under the read role. Role/managed-identity caches can take longer than a few minutes; capture observations without claiming immediate revocation. Never use a real secret as an argument or in this script.

To rehearse rotation, temporarily re-enable the explicitly scoped seed role, write a new disposable version, restore the read role and verify the version ID changes. Remove wrapper files afterward. Keep activated `.tf` files present during the capstone's full destroy so private endpoints, DNS and role ownership remain clear; only remove them after reviewed cleanup. Soft-deleted/purge-protected vaults follow tenant retention policy.

## Validation

Show the principal object ID/role scope with identifiers redacted. `/storage-check` should succeed from the VM and public anonymous blob access should fail. Prove a missing data role yields a different incident from a missing DNS link. Keep one metric query and one Activity Log event, explaining which logs are **not** collected by this lab.

## Troubleshooting

| Symptom | First evidence | Correction |
| --- | --- | --- |
| No IMDS token | Identity attachment, audience, metadata header, no proxy | Fix token acquisition; don't store a fallback account key |
| Storage 403 with correct DNS | Role assignment/principal and propagation | Grant narrow data role or wait after verified assignment |
| Key Vault metadata visible, secret denied | Exact data role and permission model | Use Secrets User where appropriate |
| Log query empty | Diagnostic setting/agent, workspace, time range | Configure ingestion; absence is not proof of no incident |

Use a service error code and timestamps rather than only a screenshot saying 'Forbidden'. Avoid logging HTTP Authorization headers or dumping metadata token responses.

## Cleanup

Delete any optional Key Vault role assignment and disposable vault following the organization's soft-delete/purge-protection policy. Soft-deleted vaults may reserve names; purge protection cannot simply be bypassed for convenience. The capstone's identity and role are Terraform-owned and removed by its destroy. Keep diagnostic retention/cost settings in the cleanup inventory.

## Interview preparation

**Managed identity versus a stored service-principal secret?** Managed identity avoids distributing/rotating a client secret for supported Azure resources. It still needs authorization, correct token audience and working network paths.

**Why Contributor and Key Vault Secrets User separately?** One concerns management operations and one data access under RBAC. Broad management rights can still alter access boundaries, so separation of duties and restricted role-assignment permissions matter.

**What evidence do you need during a storage incident?** Request/error code, principal, role/scope, token audience, DNS/private endpoint state and recent control-plane changes. CPU charts alone cannot identify authorization failures.

## Verify your understanding

Draw the managed-identity token request and subsequent Storage request. Explain the difference between a token, a role assignment and a private endpoint. Show one successful private data access and one intentionally failed boundary test.

## Arabic takeaway

الـ managed identity بتجيب token من غير مفتاح ثابت، لكنها محتاجة RBAC وداتا role وnetwork صح. فرّق بين Activity Log والـ metrics ولوجات التطبيق؛ اللوجات مش هتتجمع تلقائيًا من غير إعداد ingestion.

## Sources

- [Managed identities overview](https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/overview)
- [Key Vault RBAC](https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide)
- [Blob authorization with Entra ID](https://learn.microsoft.com/en-us/azure/storage/blobs/authorize-access-azure-active-directory)
- [Azure Monitor overview](https://learn.microsoft.com/en-us/azure/azure-monitor/fundamentals/overview)
