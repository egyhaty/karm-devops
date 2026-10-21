## Learning objectives

Configure AzureRM with an explicit subscription, use Entra/OIDC for Blob state, explain lease locking and compare a backend authorization failure with a provider management failure.

## Prerequisites

Terraform 1.10+, Azure CLI and a dedicated subscription are required for live plans. Bootstrap a separate state RG/Storage Account/container with your administrator. The workload must not own its own backend lifecycle. The backend needs Storage Blob Data Contributor on the state container/account and working storage network connectivity; Azure resource Contributor alone is insufficient for Entra data access.

## The problem

Terraform's AzureRM provider manages Azure resources. The AzureRM backend reads/writes state blobs and leases them for locking. They are separate clients with separate authentication and network requirements. A private backend can be secure yet unreachable from a GitHub-hosted runner. Solve runner placement/private connectivity rather than temporarily opening all storage networks every deployment.

Use explicit Entra authentication, not an account key committed to `backend.tf`. The state blob may contain sensitive resource attributes, so enforce scoped data roles, encryption, versioning/soft-delete retention and restricted artifacts. A Blob lease prevents concurrent state writers; CI concurrency helps but does not replace the lease. `force-unlock` requires proof that the recorded operation is no longer active.

## In this repository

`labs/azure-app/versions.tf` pins a compatible provider major range and sets `subscription_id` explicitly. `backend.azurerm.tf.example` is inactive by default, keeping validation separate from backend use. The application Storage Account is private and ephemeral; it is **not** the state account. Existing production Terraform remains untouched.

## Lab

Start credential-free schema validation and provider inspection:

```bash
cd golang/content/labs/azure-app
terraform init -backend=false
terraform fmt -check
terraform validate
terraform providers
```

Have an authorized operator bootstrap the independent backend, enable blob versioning and soft delete, and assign your state identity the required data role. Select an allowed runner network. Copy the example and supply only non-secret identifiers:

```bash
cp backend.azurerm.tf.example backend.tf
terraform init -migrate-state \
  -backend-config="storage_account_name=$LAB_STATE_ACCOUNT" \
  -backend-config="container_name=tfstate" \
  -backend-config="key=cloud-learning/azure-app.tfstate"
```

The example uses `use_azuread_auth = true`. For local Azure CLI authentication ensure the logged-in tenant/subscription are correct. For CI use `use_oidc = true` and the documented workload identity environment variables, rather than setting a client secret. If your backend resolves through a private endpoint, validate DNS and 443 connectivity from the actual runner before blaming the token.

After a learner-deployed Azure 07 stack, change a harmless RG tag through the console. Run `terraform plan -refresh-only -detailed-exitcode` and distinguish 0 (no change), 2 (successful difference) and 1 (failure). Compare with a normal plan. Decide whether to restore the declared tag or intentionally update configuration, then verify a no-change normal plan.

Module-design exercise: separate VNet/private DNS into a reusable module with outputs for app subnet and endpoint subnet IDs. Keep state backend bootstrap and role-assignment administration outside that module. Use `moved` blocks for a refactor, inspect resource addresses and ensure the plan does not replace the VM/NIC merely because an address changed. The capstone remains a readable root module for first-time Azure diagnosis; this refactor is an assessed extension.

## Validation

Confirm state is stored under the intended unique key and a lease is held during an operation. Verify blob versioning/retention on the **backend** account. Show a plan using the correct provider subscription and evidence that the workload RG does not contain its state account. For static-only learners, label backend/lease checks as unexecuted.

## Troubleshooting

| Failure | Evidence | Response |
| --- | --- | --- |
| Backend 403, provider works | Data role and auth mode on state blob | Grant correct data role, not broader subscription Owner |
| Provider subscription error | Explicit subscription/tenant and identity scope | Fix provider settings separately |
| Backend timeout | Runner DNS, storage firewall/private path | Restore connectivity |
| Lease held after CI crash | Lease/lock ID and active operation inventory | Unlock only confirmed orphan; preserve state version |

Do not run two independent states against the same resources. Moving state between backends requires a reviewed migration and secure backup, not copying only the Terraform source. `terraform init -reconfigure` ignores a previous backend configuration; it is not equivalent to migrating existing state.

## Cleanup

Remove temporary plans and working caches. Destroy the workload before retiring the backend. Keep the independent backend's retained versions until the recovery policy permits deletion, then have its owner remove the dedicated state resources. Never delete a live state blob just to clear a lock.

## Interview preparation

**Why does Azure Contributor still get backend 403?** Blob state uses a data plane, and Entra data authorization requires the appropriate role at its scope. Also check network policy and identity before granting anything.

**How do self-hosted runners help private state?** They can reach private DNS/endpoints from an approved VNet. That solves a network requirement, while identity, runner isolation and state permissions still need separate controls.

**How do you handle an orphaned lease?** Verify the owner/run has ended, record the lock metadata, preserve a state recovery point and use the documented unlock flow. Never break an active writer's lock to speed up a deployment.

## Verify your understanding

Draw provider API traffic and backend Blob traffic as separate lines with separate roles. Explain the difference between migrate-state and reconfigure, and demonstrate a harmless drift review without automatically applying it.

## Arabic takeaway

الـ provider والـ backend اتنين clients مختلفين؛ نجاح واحد مش دليل إن التاني شغال. الـ state على Blob محتاج data role وlease locking ومسار شبكة صحيح، ويفضل يكون عمره مستقل عن موارد التطبيق.

## Sources

- [AzureRM backend](https://developer.hashicorp.com/terraform/language/backend/azurerm)
- [Terraform Azure authentication](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/guides/azure_cli)
- [Terraform state on Azure Storage](https://learn.microsoft.com/en-us/azure/developer/terraform/store-state-in-azure-storage)
