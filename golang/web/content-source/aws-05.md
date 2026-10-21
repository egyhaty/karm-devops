## Learning objectives

Separate Terraform's dependency graph from cloud readiness. Design module interfaces, protect remote state and locks, interpret detailed plan exit codes and choose between reconciling configuration, import and intentional drift adoption.

## Prerequisites

Use Terraform 1.10+ for S3 native lockfiles and a sandbox role. Backend initialization downloads providers and can contact a backend; it is not an offline operation. You can run fmt and schema validation without provisioning resources. The backend bucket must be bootstrapped outside the workload state so destroying a workload cannot destroy its own state storage.

## The problem

State maps Terraform addresses to remote resources and can contain sensitive attributes. A private Git repository is not a state backend. Encryption at rest, restricted IAM, versioning, locking and recovery procedures all matter. Workspaces separate state namespaces but do not alone separate AWS accounts or IAM roles. Provider credentials and backend credentials are resolved separately.

The capstone extracts its network into a module with explicit VPC/subnet outputs. It leaves application resources visible in the root for review. A module should encapsulate a cohesive lifecycle, not wrap every resource in a one-line abstraction. Changing a subnet CIDR, resource address or immutable property can replace resources; inspect the plan's replacement paths. Use `moved` blocks to refactor addresses with continuity and import blocks for intentionally adopted existing resources.

## In this repository

Only work in `golang/content/labs/aws-wordpress/`. Read `modules/network/main.tf` and its variables/outputs. Root `terraform/` is a different infrastructure lifecycle and must not receive these providers, backend settings or cloud state. `backend.s3.tf.example` is deliberately inactive until copied by the learner.

## Lab

Start with the local state backend and schema checks:

```bash
cd golang/content/labs/aws-wordpress
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
terraform providers
```

For remote state, have your sandbox administrator create a dedicated private, encrypted, versioned S3 bucket and grant scoped state-object access plus Get/Put/Delete for the `.tflock` object. Do not grant DeleteObject on historical state versions to ordinary apply roles. Copy the backend example and initialize with non-secret parameters:

```bash
cp backend.s3.tf.example backend.tf
terraform init -migrate-state \
  -backend-config="bucket=$LAB_STATE_BUCKET" \
  -backend-config="key=cloud-learning/wordpress/terraform.tfstate" \
  -backend-config="region=$AWS_REGION"
```

The example enables `use_lockfile = true`. DynamoDB-based S3 locking is deprecated in current HashiCorp guidance. Store credentials in the AWS credential chain, never backend arguments or committed files. If migrating an existing state, back it up in a private location, verify lineage/serial and inventory resources after migration; do not create a second state independently for the same live resources.

After the optional AWS 07 deploy, change only the `Purpose` tag of your lab VPC through the console. Detect the controlled drift without accepting it:

```bash
set +e
terraform plan -refresh-only -detailed-exitcode -out=drift.tfplan
PLAN_EXIT=$?
set -e
case "$PLAN_EXIT" in
  0) echo 'No drift' ;;
  2) echo 'Drift found: inspect the plan' ;;
  *) echo 'Plan failed; this is not a clean bill of health'; exit "$PLAN_EXIT" ;;
esac
terraform show drift.tfplan
terraform plan -out=reconcile.tfplan
```

A refresh-only plan proposes updating state to observed reality; applying it does not restore declared configuration. A normal plan shows the actions needed to reconcile the tag. Restore via a reviewed normal apply in the sandbox or intentionally update the code; document the choice. Plan files can contain secrets, so keep them private, short-lived and out of Git/artifacts unless encrypted with restricted access.

## Validation

Confirm a no-change normal plan after reconciliation. Test locking with two sandbox operations: a second writer should wait/fail, not overwrite concurrently. Do not force-unlock a running operation. Record the module output contract and one replacement example without applying it. Prove the backend bucket survives workload destroy and old state versions remain recoverable.

## Troubleshooting

| Failure | Evidence | Next step |
| --- | --- | --- |
| Backend AccessDenied, provider reads work | Separate role/region/key and `.tflock` permissions | Repair backend scope |
| Lock held | Lock owner, operation ID, active CI run | Wait or cancel cleanly; force-unlock only proven orphan |
| Massive replacement after refactor | Addresses and moved blocks | Preserve identities before applying |
| Plan exit 1 reported as drift | Error diagnostics | Treat as failure, not exit 2 |

`prevent_destroy` is a configuration guard, not backup or an IAM deny. Removing a resource block removes that guard. `ignore_changes` can hide relevant drift; use it only for fields deliberately owned elsewhere. Avoid routine `-target`: partial graphs are an incident tool, not a deployment architecture.

## Cleanup

Remove local plan files and any `.terraform` cache when finished. Destroy workload resources before retiring the backend. Keep the state backend/version history until the exercise's retention window is complete; only its owner should remove versions and locks after verifying no active consumers. Never delete state as a substitute for destroying cloud resources.

## Interview preparation

**Why separate backend bootstrap?** The workload cannot depend on a backend that must already exist to initialize. Independent lifecycle and access boundaries avoid destroying the recovery record with the workload.

**How would you adopt a console-created resource?** Describe ownership, add matching configuration, use an import block, inspect a full plan for unexpected changes and commit the declaration. Import is an ownership mapping, not automatic design discovery.

**Why not automatically apply drift detection?** It may undo an intentional emergency action or adopt an attacker change. Detect, classify and review before choosing restore versus code update.

## Verify your understanding

Explain the difference between refresh-only and normal plans, capture exit codes correctly and show why a saved plan is sensitive. Completion requires a reviewed plan or clearly labelled static walkthrough, not a claim of deployment.

## Arabic takeaway

الـ state سجل ملكية وربط الموارد وممكن يحتوي أسرار. حطه في backend محمي مع versioning وlocking. اكتشاف drift مش قرار إصلاح تلقائي؛ افهم التغيير وراجع plan قبل أي apply.

## Sources

- [S3 backend and native locking](https://developer.hashicorp.com/terraform/language/backend/s3)
- [Terraform plan modes](https://developer.hashicorp.com/terraform/cli/commands/plan)
- [Refactoring with moved blocks](https://developer.hashicorp.com/terraform/language/modules/develop/refactoring)
