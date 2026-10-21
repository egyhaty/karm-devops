## Learning objectives

Build a VNet/subnet boundary, inspect NSG rules and route-table associations, and explain private endpoint DNS resolution. Translate AWS mental models without assuming identical defaults or features.

## Prerequisites

Use the sandbox subscription from Azure 01. Azure CLI and dig/getent are useful. This basic lab creates networking control objects only; private endpoints, VMs, NAT and Network Watcher diagnostics may add charges. Runtime private-endpoint evidence is collected in Azure 07, which includes a private VM probe rather than testing only from your laptop.

## The problem

A VNet is the address/routing boundary. Azure provides system routes, which can be overridden by user-defined routes where applicable; longest prefix and route-source precedence matter. An NSG is stateful and can be associated with a subnet and/or NIC. When both apply, traffic must pass both. Lower priority numbers are evaluated first, and default rules still exist. Azure NSGs are not AWS stateless NACLs.

A private endpoint assigns a private IP in your VNet to a service's private connection. It does not automatically disable the service's public access or grant data authorization. Service endpoints instead extend service identity/connectivity from a subnet to the service's public endpoint; they are not interchangeable with private IP endpoints.

For Blob Storage, clients continue using `ACCOUNT.blob.core.windows.net`. Correct DNS resolves through the private-link name to a private A record from a linked private DNS zone. From on-premises, linking a zone to a VNet alone does not configure corporate DNS forwarding; Azure DNS Private Resolver or an appropriate forwarding design is needed. Testing only from a public laptop will not prove private DNS works for a VM.

## In this repository

The Azure capstone contains a VNet, app and private-endpoint subnets, a `privatelink.blob.core.windows.net` zone, a VNet link and a private-endpoint DNS zone group. Its storage account disables public network access. Its VM has no public IP and uses managed identity for blob access.

## Lab

Select your sandbox subscription and create a fresh RG. Preserve these names in the same shell:

```bash
az account set --subscription "$LAB_SUBSCRIPTION_ID"
export NET_RG="cloud-net-$(date +%s)"
az group create -n "$NET_RG" -l westeurope --tags Purpose=cloud-learning
az network vnet create -g "$NET_RG" -n lab-vnet --address-prefixes 10.60.0.0/16 --subnet-name app --subnet-prefixes 10.60.10.0/24
az network nsg create -g "$NET_RG" -n app-nsg
az network vnet subnet update -g "$NET_RG" --vnet-name lab-vnet -n app --network-security-group app-nsg
az network route-table create -g "$NET_RG" -n lab-routes
az network vnet subnet update -g "$NET_RG" --vnet-name lab-vnet -n app --route-table lab-routes
az network nsg rule list -g "$NET_RG" --nsg-name app-nsg --include-default -o table
az network vnet subnet show -g "$NET_RG" --vnet-name lab-vnet -n app --query '{prefix:addressPrefix,nsg:networkSecurityGroup.id,routeTable:routeTable.id}'
```

An empty user route table does not mean no routes: system routes still apply. Do not assume new private VMs receive implicit internet egress. Explicit outbound connectivity should be designed and is provided through a NAT Gateway in the capstone.

Optional deployed capstone drill: use VM Run Command from Azure 07 to run `getent ahostsv4 "$LAB_STORAGE_FQDN"` **inside the VM**, then inspect the blob private endpoint connection status and DNS A record. Controlled failure: remove only the capstone's VNet DNS link in a temporary Terraform change, review/apply it in the sandbox and repeat. Observe whether the name now resolves publicly and storage blocks the connection. Restore the link through Terraform and wait for DNS cache expiry. Record the exact result rather than assuming every resolver has the same cache.

## Validation

The app subnet must reference the intended NSG and route table. Distinguish configured UDRs from effective NIC routes, which can be inspected only once a NIC/VM exists. For the private endpoint drill, resolve the normal storage hostname to its expected private IP from the VM, confirm private endpoint Approved, and separately test data authorization.

## Troubleshooting

| Symptom | First check | Next layer |
| --- | --- | --- |
| Blob hostname resolves publicly in VM | Zone name, A record, VNet link, custom resolver | Endpoint connection and public-access policy |
| NSG appears to allow, connection times out | Both NIC/subnet effective NSGs and destination listener | Effective route and appliance return path |
| On-premises fails, Azure VM works | DNS forwarding and VPN/ExpressRoute path | Private endpoint routing and source controls |
| Private DNS succeeds, HTTP 403 | Managed identity role and firewall evidence | Network reachability is not data authorization |

Use `az network nic show-effective-route-table` and `az network nic list-effective-nsg` with the capstone NIC. For packet evidence, a paid Network Watcher connection troubleshoot/IP flow verify exercise can complement OS-level tests; static topology alone does not prove a listener is healthy.

## Cleanup

```bash
az group delete -n "$NET_RG" --yes
az group exists -n "$NET_RG"
```

Restore any controlled DNS change before the capstone's own cleanup. Delete the capstone via Terraform, not this temporary RG command. Check private endpoint NICs and links belong to the resource group you intend to remove.

## Interview preparation

**Private endpoint resolves to a public IP. Is RBAC the first fix?** No. Test resolution from the workload, zone/link/forwarding and endpoint state. RBAC is a separate layer after connectivity.

**NSG versus AWS NACL?** NSGs are stateful and attach to subnet/NIC scopes; AWS NACLs are stateless subnet controls. Do not carry over ephemeral return-rule assumptions mechanically.

**Can public access remain enabled with a private endpoint?** Yes. Disable/restrict it explicitly if required, then prove that intended clients use the private path and unwanted public access fails.

## Verify your understanding

Draw normal hostname → DNS chain → private IP → service → identity authorization. Show a deliberate DNS failure/recovery or label it as a planned runtime drill. Explain where effective routes differ from the table you configured.

## Arabic takeaway

الـ NSG stateful ومش نسخة من NACL. الـ private endpoint محتاج DNS صح من داخل الشبكة، ومش بيلغي public access أو بيدي صلاحيات للداتا لوحده. افصل DNS عن routing وعن RBAC في التشخيص.

## Sources

- [NSG evaluation](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview)
- [Azure routing](https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-udr-overview)
- [Private endpoint DNS](https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-dns)
- [Explicit outbound connectivity](https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/default-outbound-access)
