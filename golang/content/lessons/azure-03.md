## Learning objectives

Choose between Azure Load Balancer and Application Gateway, inspect a VM's application and agent health, and design a controlled VM Scale Set rollout across supported availability zones.

## Prerequisites

Use Azure CLI and review the Azure 07 capstone first. Live compute costs money and depends on regional SKU/quota availability. This module includes a local configuration design path plus commands for an already-deployed learner-owned VM. It does not create a second compute stack just to demonstrate a command.

## The problem

Azure Load Balancer is a layer-4 TCP/UDP service; Application Gateway is layer 7 for HTTP routing, TLS termination and optional WAF. An internal Standard Load Balancer can keep a service private. A public Application Gateway has a different cost, routing, subnet, certificate and health-probe model. Neither is a universal replacement for the other.

VM Scale Sets manage a group of VM instances; orchestration mode, image version, upgrade policy, health signals and zone support affect operational behavior. A running instance is not proof of a listening application. Health probes must reach the actual listener, and application health for repairs/rolling upgrades must be deliberately configured. An autoscale rule needs measured demand and realistic limits; a CPU threshold cannot repair a slow shared datastore.

Availability sets separate fault/update domains, while availability zones are distinct physical locations in supported regions. Zone redundancy requires service/SKU support, sufficient capacity and an application that tolerates partial loss. A single regional VM remains a single point of failure even if its disks are replicated.

## In this repository

The Azure capstone intentionally uses one private Linux VM and an internal Standard Load Balancer for a bounded troubleshooting exercise. It is **not** an HA/VMSS implementation. You will design and validate the VMSS/Application Gateway alternative here rather than claim that the smaller capstone already implements it. The AWS capstone supplies the concrete two-AZ autoscaling exercise.

## Lab

First write an ingress decision record with two rows: private TCP service through Standard Load Balancer and public HTTP hostname routing through Application Gateway. For each, record TLS location, source-IP behavior, probe source, subnet requirements, logs, cost and failure domain.

For a learner-deployed Azure 07 stack, export its exact identifiers and inspect VM status:

```bash
cd golang/content/labs/azure-app
RG=$(terraform output -raw resource_group_name)
VM=$(terraform output -raw vm_name)
NIC=$(terraform output -raw nic_name)
az vm get-instance-view -g "$RG" -n "$VM" --query 'instanceView.statuses' -o table
az network nic show -g "$RG" -n "$NIC" --query '{private:ipConfigurations[0].privateIPAddress,public:ipConfigurations[0].publicIPAddress}'
az network nic list-effective-nsg -g "$RG" -n "$NIC" -o json
az vm run-command invoke -g "$RG" -n "$VM" --command-id RunShellScript --scripts 'systemctl is-active cloud-lab-app; curl -fsS http://127.0.0.1:8080/healthz' --query 'value[].message' -o tsv
```

No public IP should be assigned. VM Run Command requires the VM agent and working platform connectivity, and executes with elevated privileges; it is not the same path as a client request through the load balancer.

Controlled failure: stop the lab service via Run Command, observe local curl failure and load-balancer backend health metrics, then restart it. Use Azure 07's probe VM test to prove the internal VIP is unavailable/recovered. VM power state should remain running throughout: this demonstrates the difference between machine health and application health.

Design extension: create a Terraform proposal replacing the single NIC/VM with a VMSS spanning supported zones, an image version, load-balancer backend association, health/repair configuration and bounded rolling upgrades. Review it with `terraform validate` and a sandbox plan after checking the provider schema; do not blindly apply because a sample SKU exists in a different region. For an Application Gateway variant, reserve its dedicated subnet and define a backend health path returning 200 without login redirects.

### VMSS hands-on extension

An inert, deployable configuration is provided as [vmss.tf.example](../labs/azure-app/vmss.tf.example). In the sandbox capstone directory, copy it to `vmss.tf`, check region/SKU zone support, then run `terraform validate` and a reviewed `terraform plan`. It adds two zonal instances to the internal LB pool and grants their managed identity Blob Data Reader. This is additional paid capacity; apply only in a separately budgeted window. The original single VM remains for comparison.

```bash
cp vmss.tf.example vmss.tf
terraform validate
terraform plan -out=vmss.tfplan
# Explicit extra-cost decision before terraform apply vmss.tfplan.
az vmss list-instances -g "$RG" -n lab-vmss --query '[].{ID:instanceId,Zone:zones,State:provisioningState}' -o table
az vmss get-instance-view -g "$RG" -n lab-vmss --instance-id 0
```

After a reviewed image/custom-data update is applied to the VMSS model, use `az vmss update-instances -g "$RG" -n lab-vmss --instance-ids 0` to update one lab instance, verify probe/client results, then update the next instance. This deliberately manual rollout teaches model versus instance state. It is not an automatic rolling-upgrade policy. Record observed capacity and stop if healthy capacity drops below the chosen threshold. Pin the image version for repeatability.

### Application Gateway hands-on extension

[application-gateway.tf.example](../labs/azure-app/application-gateway.tf.example) adds a dedicated subnet and a **private HTTP** L7 listener pointing at the internal LB. It is an intentionally visible extra hop for comparing L4/L7 health contracts, not the recommended minimal production path. The required v2 platform public IP has no public listener. In private tfvars set `app_client_cidrs = ["10.60.10.0/24", "10.60.30.0/24"]`, copy the example to `application-gateway.tf`, validate and review the added gateway cost before applying.

```bash
az network application-gateway show-backend-health -g "$RG" -n lab-http-gateway -o json
az vm run-command invoke -g "$RG" -n lab-probe --command-id RunShellScript --scripts 'curl -fsS http://10.60.30.10/healthz' --query 'value[].message' -o tsv
```

With the optional probe VM enabled, deliberately change only the gateway probe path to a nonexistent path in Terraform, review/apply, observe backend health and client failure, then restore `/healthz`. Add HTTPS/certificate and WAF policy as a separate design exercise; this private HTTP extension does not claim TLS/WAF protection. For cleanup, leave activated files present while reviewing/applying the capstone's full destroy, then remove them. Deleting the files first without reviewing the resulting plan can obscure the intended lifecycle.

## Validation

Evidence includes VM running state, service stopped/running state, no public NIC IP, private probe results and recovery time. Your decision record must explain why this capstone cannot demonstrate multi-instance failover. The VMSS design must state min/max capacity and rollout failure policy rather than only a desired count.

## Troubleshooting

| Symptom | Evidence | Repair |
| --- | --- | --- |
| VM running, listener unavailable | systemd status and local curl | Restore process/configuration |
| Local curl works, LB fails | Backend association, probe path/port, NSG AzureLoadBalancer rule | Restore backend/probe reachability |
| Application Gateway 502 | Backend health reason, Host/TLS settings, listener | Fix contract between gateway and backend |
| Scale-out fails | Quota, SKU/zone availability and activity log | Choose approved capacity or request quota |

Do not open public SSH to debug an internal LB. Run Command/Bastion/private access are different management options with distinct cost and policy implications. An internal VIP cannot be tested directly from an unrelated public laptop.

## Cleanup

Restart the lab app if you stopped it. Remove temporary load generators and VMSS proposal files if not retained as review evidence. Destroy the underlying capstone with its own Terraform state. Any extra scale set/gateway you independently deployed needs its own inventory and destroy plan.

## Interview preparation

**Load Balancer or Application Gateway?** Start from protocol and routing requirements. L4 private TCP distribution fits Load Balancer; host/path routing, HTTP TLS policy and WAF can justify Application Gateway. Explain cost and observability tradeoffs.

**How do you prove an autoscaling setup is useful?** Drive bounded load, measure latency/error/queue depth and resource saturation, observe scale-out timing and verify the datastore can handle added concurrency. Instance count alone is not success.

**How do you roll back a bad VM image?** Keep a known-good immutable version, stop/abort the rollout, restore the desired version and refresh with healthy capacity. Handle schema compatibility separately.

## Verify your understanding

Explain running versus ready with your controlled outage. Present the VMSS extension as a design until tested, and name two ways a bad probe can trigger unnecessary repairs or hide real application failure.

## Arabic takeaway

الـ VM شغالة مش معناها التطبيق جاهز. اختار Load Balancer للـ L4 وApplication Gateway لاحتياجات HTTP وTLS/WAF. الـ VMSS محتاج health وrollout وخطة capacity؛ اللاب الصغير هنا مش HA لوحده.

## Sources

- [Load balancing options](https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/load-balancing-overview)
- [VM Scale Sets](https://learn.microsoft.com/en-us/azure/virtual-machine-scale-sets/overview)
- [Application Gateway backend health](https://learn.microsoft.com/en-us/azure/application-gateway/application-gateway-backend-health)
