## Learning objectives

Deploy a private application path with explicit outbound connectivity, prove private endpoint DNS and data authorization from inside the VNet, and distinguish load-balancer, service, DNS and identity incidents. Produce an interview-ready incident report with rollback and cleanup evidence.

## Prerequisites

Use a sandbox subscription, Azure CLI and Terraform 1.10+. Supply a local SSH **public** key for VM creation, though the lab uses Run Command and never opens SSH. Check quotas and availability for the selected VM size/region. Price VM/disks, NAT/public IP, Standard Load Balancer, Storage and private endpoint charges; set a destroy deadline. Budget alerts are not hard spending limits.

No application secrets or account keys are needed. Your deployment identity needs resource management rights for the lab RG and permission to assign the Storage Blob Data Reader role; separate bootstrap role assignment from routine CI where appropriate. Use local state initially or the independent backend from Azure 05.

## The problem

The application is a small Python HTTP service with `/healthz` and `/storage-check`. It runs on a VM with no public IP behind an **internal** Standard Load Balancer. The VM obtains a Storage token through managed identity and lists a private Blob container via a private endpoint and linked DNS zone. The Storage Account disables shared keys, public access and anonymous containers. A NAT Gateway supplies explicit outbound access for bootstrap, agent and Azure APIs; it does not provide inbound access.

```text
Management: Azure CLI → VM Run Command (platform agent)
Client test: temporary private probe VM → internal LB :8080 → app VM :8080
App VM → normal Blob hostname → private DNS → Blob private endpoint
App VM → IMDS managed identity token → Storage data role → list container
App VM/probe subnet → NAT → internet egress (not inbound SSH)
```

This is a secure-boundary troubleshooting lab, not a highly available production implementation. It has one application VM, no public website, and internal HTTP rather than TLS. Azure 03's extension designs VMSS/zones/Application Gateway. A real deployment needs TLS, resilient compute, diagnostic ingestion, backups where state is added, hardened images and tested releases.

## In this repository

Use `golang/content/labs/azure-app/` only. `main.tf` creates the isolated RG, VNet/subnets/NSG, NAT, load balancer, private storage endpoint/DNS and VM managed identity/role. `app.py` uses Python's standard library, checks the metadata header and never logs tokens. `cloud-init.yaml.tftpl` installs the service without external package dependencies. A second probe VM is optional and disabled by default. Download the README at `../labs/azure-app/README.md` for file links.

## Lab

```bash
cd golang/content/labs/azure-app
az account set --subscription "$LAB_SUBSCRIPTION_ID"
az account show --query '{subscription:id,tenant:tenantId}'
terraform init -backend=false
terraform validate
cp terraform.tfvars.example terraform.tfvars
# Edit subscription_id, public key path, unique storage name, region and budgeted VM size.
terraform plan -out=azure-lab.tfplan
terraform show -no-color azure-lab.tfplan
```

Read the plan for private addressing, NSG scope, public Storage disabled, shared-key access disabled, private endpoint connection and role assignment. **Applying creates paid resources; proceed only after your own cost/account review.**

```bash
terraform apply azure-lab.tfplan
RG=$(terraform output -raw resource_group_name)
VM=$(terraform output -raw vm_name)
FQDN=$(terraform output -raw storage_fqdn)
az vm run-command invoke -g "$RG" -n "$VM" --command-id RunShellScript --scripts "getent ahostsv4 $FQDN; systemctl is-active cloud-lab-app; curl -fsS http://127.0.0.1:8080/storage-check" --query 'value[].message' -o tsv
```

Wait for VM agent readiness and RBAC propagation; do not mask an ongoing failure as eventual consistency indefinitely. The normal Blob hostname must resolve to the endpoint's private IP from the VM. The app should return a successful Storage status without returning a token or blob payload.

To prove the actual client path, enable `enable_probe = true` in your private tfvars, review/apply the incremental cost, then use the probe VM (same VNet, no public IP) to call the **internal LB** output on port 8080 through Run Command. Calling the LB from the backend VM itself can involve hairpin behavior, so use the separate probe:

```bash
PROBE=$(terraform output -raw probe_vm_name)
VIP=$(terraform output -raw internal_lb_ip)
az vm run-command invoke -g "$RG" -n "$PROBE" --command-id RunShellScript --scripts "curl -fsS http://$VIP:8080/healthz; curl -fsS http://$VIP:8080/storage-check" --query 'value[].message' -o tsv
```

Controlled incidents, one at a time:

1. Stop `cloud-lab-app` via app VM Run Command. Confirm VM remains running, local curl fails and probe-to-LB fails after health detection. Restart it and measure recovery.
2. Temporarily remove the private DNS VNet link through a reviewed Terraform edit, repeat name lookup and storage-check from the VM, then restore. Record cache effects and endpoint error evidence.
3. In the sandbox only, remove the app's Storage data role through a reviewed config edit, keeping identity attached. Token acquisition should still work, but storage access fails after authorization caches/propagation. Restore the assignment and verify recovery. Don't print the token to prove acquisition; service error/status is sufficient.

## Validation

Keep five checks: no public app/probe NIC IP; private Blob DNS IP; public Storage access blocked; managed-identity data request succeeds; probe→internal VIP succeeds. Include one failed/recovered process, DNS and role boundary with timestamps. The Terraform role resource should target the VM principal and the lab account scope, not the subscription.

## Troubleshooting

| Failure | Evidence | Repair |
| --- | --- | --- |
| Run Command unavailable | VM agent/platform connectivity, provisioning status | Restore explicit outbound/agent health |
| Local 8080 works, VIP fails | Probe VM path, LB backend NIC association, NSG probe rule | Correct LB/probe network contract |
| Storage-check timeout | DNS private IP, endpoint approval, NSG/route | Restore private connectivity |
| Storage-check 403 | Service code, exact principal/data role | Repair RBAC; allow propagation after verification |
| Deploy fails on storage container | Provider management-plane support/schema, subscription policy | Read provider error; do not expose account keys |

## Cleanup

Restore all intentional edits before destroying so ownership matches state. Review and apply a destroy plan in this same directory/backend:

```bash
terraform plan -destroy -out=azure-destroy.tfplan
terraform show -no-color azure-destroy.tfplan
terraform apply azure-destroy.tfplan
terraform state list
az group exists --name "$RG"
rm -f azure-lab.tfplan azure-destroy.tfplan
```

Expect an empty workload state and `false` for the deleted RG. Check the Activity Log for completion and inventory any resources you manually added outside the RG, especially diagnostic workspaces/backups. The independently bootstrapped state account remains. Deleting an RG manually first is not the ordinary Terraform lifecycle.

## Interview preparation

**App can get an identity token but cannot read Storage. What next?** Check requested audience, principal, data role/scope and propagation separately from DNS/private endpoint/firewall. A token proves authentication, not authorization or network reachability.

**How do you prove the load balancer works?** Test its VIP from a separate allowed client, inspect backend association/probe rules, and induce a controlled process failure. A localhost curl on the backend proves only the listener.

**What would you change for production?** Add resilient compute and rollout, TLS ingress, least-privilege data scope, observability, image patching, explicit SLOs, tested restore if persistent app data is introduced, and cost governance. Keep these as proposed improvements until implemented and measured.

## Verify your understanding

Deliver an incident report: symptom, hypothesis, evidence, isolated cause, minimal fix, verification and prevention. Compare Azure private endpoint/managed identity boundaries with AWS endpoint/instance-profile boundaries without claiming they are identical.

## Arabic takeaway

ابنِ مسار خاص كامل واختبره من جوه الشبكة ومن client منفصل. نجاح token مش نجاح Storage، ونجاح localhost مش نجاح الـ load balancer. اعزل عطل الخدمة عن DNS وعن RBAC، وارجع كل حاجة ثم امسح موارد اللاب.

## Sources

- [Internal Standard Load Balancer](https://learn.microsoft.com/en-us/azure/load-balancer/quickstart-load-balancer-standard-internal-terraform)
- [Managed identity on an Azure VM](https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/how-to-use-vm-token)
- [Private endpoints for Storage](https://learn.microsoft.com/en-us/azure/storage/common/storage-private-endpoints)
- [Azure VM Run Command](https://learn.microsoft.com/en-us/azure/virtual-machines/linux/run-command)
