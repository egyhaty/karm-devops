# Azure private application capstone (paid, learner-run)

Follow Azure 07 for cost checks, explicit apply, validation, incident drills and destroy. Independent of the live cluster and root Terraform.

Download to the same relative layout, including the [provider lockfile](./.terraform.lock.hcl):

- [versions.tf](./versions.tf), [variables.tf](./variables.tf), [main.tf](./main.tf)
- [app.py](./app.py), [cloud-init.yaml.tftpl](./cloud-init.yaml.tftpl)
- [terraform.tfvars.example](./terraform.tfvars.example)
- [backend.azurerm.tf.example](./backend.azurerm.tf.example) (inactive)

Requirements: Terraform >=1.10, Azure CLI, sandbox subscription, quotas/budget, resource creation and scoped role-assignment permissions, a local SSH public key. There is no inbound SSH rule or public VM IP. VM Run Command uses the Azure agent and elevated execution, not inbound SSH. Identity/data access are tested by the private app.

```bash
terraform init -backend=false
terraform validate
cp terraform.tfvars.example terraform.tfvars
# Replace placeholders and confirm account, SKU availability and cost.
terraform plan -out=azure-lab.tfplan
# Explicit paid-resource decision before:
terraform apply azure-lab.tfplan
```

App: `GET /healthz` is shallow; `GET /storage-check` requests an IMDS Storage token and lists the private `lab` container without returning contents/tokens. Container creation uses AzureRM's management-plane `storage_account_id` path. RBAC can take time to propagate. The guest uses Python standard library, available in the selected Ubuntu image; no pip/package download is required.

For real client→internal-LB validation enable `enable_probe=true`, review/apply the additional VM cost, then run curl to `internal_lb_ip:8080` from `probe_vm_name` using Run Command. Do not rely on backend-to-own-LB hairpin tests. Probe VM also has no public IP.

Costs: app/probe VM+disks, Standard LB, NAT+public IPv4, Storage, private endpoint and transfer. NAT makes egress explicit. Storage shared keys/public access are disabled; identity has Blob Data Reader at the lab account scope.

Limits: one app VM (not HA), internal HTTP (no TLS ingress), LRS lab storage, mutable image version, no Key Vault resource/secret required, no Log Analytics/guest log ingestion or autoscaling. Key Vault, VMSS, zones, Application Gateway/TLS and observability are assessed extensions in the lessons, not implemented claims.

Destroy from the same state with a reviewed `terraform plan -destroy`, verify workload state empty and RG absent. Independent state backend stays retained. Do not delete root production RGs/resources.

Optional separately budgeted compute experiments: [vmss.tf.example](./vmss.tf.example) and [application-gateway.tf.example](./application-gateway.tf.example). Copy to `.tf` only when intentionally activating them. Read Azure 03's validation, trust and cleanup instructions; the gateway requires adding `10.60.30.0/24` to `app_client_cidrs`. Its private HTTP listener is a diagnostic comparison, not a TLS production ingress. Do not mix standalone and inline NSG rule ownership. Retain active files until a reviewed destroy completes.

Optional private Key Vault exercise: [key-vault.tf.example](./key-vault.tf.example), [vault-check.py](./vault-check.py). Follow Azure 04 for the explicitly temporary seed permission and return to Secrets User. Only a fixed disposable non-secret string is written, and the script prints a version ID, never a token/value. No secret value is managed by Terraform.
