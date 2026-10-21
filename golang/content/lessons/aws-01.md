## Learning objectives

Trace a TCP connection across subnet routes, Internet Gateway (IGW), NAT Gateway, security groups (SGs) and network ACLs (NACLs). Distinguish a missing route from a rejected packet and a failing DNS query. Produce a route/port matrix suitable for an interview whiteboard.

## Prerequisites

You already know Linux routing and Kubernetes Services. Use AWS CLI v2, jq and a dedicated sandbox account. Set a spending alert before any paid extension; an AWS Budget alerts you but is not a hard spending cap. These commands create VPC control-plane objects only, without EC2 or NAT. Read the current regional price sheet before launching the capstone. Never use this repository's production credentials.

## The problem

A private instance cannot install packages. Adding `0.0.0.0/0` to its SG does not supply a route, a NAT device, or working DNS. A public subnet means its route table points an internet default route at an IGW; it does not mean every instance has a public address. IPv4 internet access through an IGW also needs a public IPv4 association on the instance. A public NAT Gateway needs an Elastic IP and an IGW path in its public subnet; private workloads route to it and do not become internet-addressable.

An SG is stateful and attached to an ENI: allowed connection responses are tracked. A NACL is stateless, applies at the subnet boundary, and evaluates numbered rules in ascending order until a match. Allow the request destination port and the return ephemeral ports in the appropriate directions. NAT Gateways do not have SGs. Neither a NAT route nor a broad allow rule grants IAM access to S3.

For high availability, place public ingress, private app and isolated database subnets in two AZs. One NAT per AZ avoids a single egress dependency and cross-AZ routing for that design; a single NAT is a deliberate lower-cost lab compromise, not AZ-resilient egress. Gateway endpoints can keep S3/DynamoDB traffic off NAT; interface endpoints add private ENIs, DNS and per-hour/data charges.

## In this repository

Use `golang/content/labs/aws-wordpress/modules/network/` to compare a reproducible two-AZ topology to this small CLI experiment. `terraform/` at the repository root is the existing platform; do not run cloud learning commands there. Downloadable examples live under `../labs/aws-wordpress/README.md`.

## Lab

Start a fresh shell. Choose a permitted region explicitly and record the caller account before creating anything:

```bash
export AWS_PROFILE=cloud-lab
export AWS_REGION=eu-west-1
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}'
VPC_ID=$(aws ec2 create-vpc --cidr-block 10.42.0.0/16 --query Vpc.VpcId --output text)
aws ec2 create-tags --resources "$VPC_ID" --tags Key=Purpose,Value=cloud-learning
aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-support '{"Value":true}'
AZ=$(aws ec2 describe-availability-zones --filters Name=state,Values=available --query 'AvailabilityZones[0].ZoneName' --output text)
SUBNET_ID=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --cidr-block 10.42.10.0/24 --availability-zone "$AZ" --query Subnet.SubnetId --output text)
RT_ID=$(aws ec2 create-route-table --vpc-id "$VPC_ID" --query RouteTable.RouteTableId --output text)
ASSOC_ID=$(aws ec2 associate-route-table --subnet-id "$SUBNET_ID" --route-table-id "$RT_ID" --query AssociationId --output text)
IGW_ID=$(aws ec2 create-internet-gateway --query InternetGateway.InternetGatewayId --output text)
aws ec2 attach-internet-gateway --vpc-id "$VPC_ID" --internet-gateway-id "$IGW_ID"
aws ec2 create-route --route-table-id "$RT_ID" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW_ID"
aws ec2 describe-route-tables --route-table-ids "$RT_ID" --query 'RouteTables[0].Routes'
```

Draw the route before calling the subnet public. Now deliberately remove only this sandbox default route:

```bash
aws ec2 delete-route --route-table-id "$RT_ID" --destination-cidr-block 0.0.0.0/0
aws ec2 describe-route-tables --route-table-ids "$RT_ID" --query 'RouteTables[0].Routes'
aws ec2 create-route --route-table-id "$RT_ID" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW_ID"
aws ec2 describe-network-acls --filters Name=vpc-id,Values="$VPC_ID" --query 'NetworkAcls[].Entries'
```

A new VPC's default NACL allows traffic; a custom NACL starts with deny rules. Write a proposed custom NACL matrix for HTTPS client egress: outbound destination 443, inbound client ephemeral ports, plus app/database flows separately. Do not attach an untested custom NACL to a live subnet. In the capstone, enter the app through SSM, run `getent hosts wordpress.org`, `curl -I https://wordpress.org`, `ip route`, and compare the instance route with the VPC route table. The OS default gateway alone cannot reveal the VPC's NAT target.

## Validation

The explicit table must contain the VPC-local route and the IGW default route after recovery. The subnet has no auto public IPv4 mapping and no instance: claiming successful internet connectivity here would be false. Save the caller account, route tables and a directional SG/NACL matrix, redacting account identifiers before sharing. After the capstone, test one app instance in each AZ and document whether an egress failure affects one or both.

## Troubleshooting

| Evidence | Next test | Interpretation |
| --- | --- | --- |
| DNS lookup fails | VPC DNS attributes and resolver | Do not diagnose NAT before name resolution |
| TCP timeout to a numeric IP | Actual subnet association, route target, SG egress, NACL return range | A route in a different table is irrelevant |
| Private app works in only one AZ | Compare private tables and NAT AZs | Often an asymmetric configuration |
| S3 returns AccessDenied | Caller identity, endpoint policy, bucket/IAM policy | HTTP response proves transport, not authorization |

Use VPC Flow Logs and Reachability Analyzer for controlled paid extensions. Flow logs show accept/reject metadata, not application payload or every DNS interaction. A network path analysis does not prove an HTTP process is listening.

## Cleanup

Use the IDs from this shell only, in dependency order:

```bash
aws ec2 disassociate-route-table --association-id "$ASSOC_ID"
aws ec2 delete-subnet --subnet-id "$SUBNET_ID"
aws ec2 delete-route-table --route-table-id "$RT_ID"
aws ec2 detach-internet-gateway --vpc-id "$VPC_ID" --internet-gateway-id "$IGW_ID"
aws ec2 delete-internet-gateway --internet-gateway-id "$IGW_ID"
aws ec2 delete-vpc --vpc-id "$VPC_ID"
```

If interrupted, find the tagged VPC, inspect its dependencies, and recover IDs before deleting. This lab never allocates Elastic IPs or NAT Gateways; if you added them yourself, release/delete them explicitly after checking ownership.

## Interview preparation

**A private EC2 instance has an allow-all outbound SG but HTTPS times out. What next?** Resolve DNS, identify its ENI and actual subnet route-table association, check the default route's NAT state, the NAT's public-subnet IGW route, then both NACL directions. Correlate flow logs. Do not fix an unproven routing failure by opening inbound SSH.

**Why SG references instead of subnet CIDRs between ALB and app?** They express identity of the participating ENIs and survive IP changes. They are not transitive and do not create routes. Use CIDRs where the traffic source cannot be represented by the intended SG relationship.

**Would you deploy one NAT or two?** Quantify required AZ availability, hourly/data/cross-AZ costs and endpoint alternatives. Explain the single-AZ egress failure domain rather than answering with a universal rule.

## Verify your understanding

Without notes, draw the outbound request and return packet, including ephemeral ports. Explain why moving the same ENI rules to another subnet can change reachability. Completion evidence: route diff, restored route, cleanup confirmation and a three-minute incident explanation.

## Arabic takeaway

ابدأ بتتبّع الباكت والـ route table المرتبطة فعلًا بالـ subnet. الـ SG stateful والـ NACL stateless؛ فتح البورت لوحده مش بيعمل route. الـ NAT للخروج من الشبكة الخاصة، والـ IGW جزء من مسار الإنترنت للشبكة العامة.

## Sources

- [VPC route tables](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html)
- [Security groups and NACL comparison](https://docs.aws.amazon.com/vpc/latest/userguide/infrastructure-security.html)
- [NAT troubleshooting](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-troubleshooting.html)
