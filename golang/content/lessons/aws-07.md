## Learning objectives

Build an end-to-end application platform rather than a set of isolated services. Prove request routing, workload identity, shared uploads and data durability, rehearse a target failure and explain the availability, security and cost decisions in a senior interview.

## Prerequisites

Finish AWS 01–06. Use AWS CLI v2, Terraform 1.10+, jq, SSM Session Manager plugin and a dedicated account with a reviewed deployment role. Obtain an **issued ACM certificate in the ALB region** and a DNS name you control. Supply a reviewed WordPress release version and SHA-256 of its official release archive. A certificate ARN or hash copied from an unrelated region/release will not work. The caller needs EC2/VPC/ELB/ASG/RDS/EFS/IAM/SSM/CloudWatch permissions; role creation and PassRole should be constrained to this lab's prefix.

This is paid infrastructure: two NAT Gateways/EIPs, ALB, EC2/EBS, Multi-AZ RDS, EFS, Secrets Manager and monitoring. Set a budget alert, price the chosen region, request any needed quotas and choose a same-day destroy deadline. Nothing in this repository applies it automatically. If budget is unavailable, do the static design/plan path and explicitly report that runtime acceptance was not performed.

## The problem

A single VM with local uploads loses availability when the machine fails and can lose data when replaced. This design sends HTTPS to an ALB spanning two AZs, forwards only from the ALB SG to private app instances, shares WordPress files on encrypted EFS, and connects to a private encrypted Multi-AZ RDS MySQL instance. The ASG maintains at least two instances. There is no public SSH or public DB. Instance management uses SSM, with egress through per-AZ NAT in this learning implementation.

```text
Client → DNS → ALB HTTPS (public A/B)
                  ↓ app SG allows ALB only
             ASG EC2 (private A/B) → EFS TLS shared files
                  ↓ DB SG allows app only
             RDS MySQL Multi-AZ (isolated A/B)
EC2 role → STS credentials → one RDS-managed secret
Private A/B → same-AZ NAT → IGW (bootstrap / SSM / AWS APIs)
```

ALB TLS ends at the listener; the private ALB→Apache hop uses HTTP in this lab. RDS connections enforce TLS in WordPress and EFS mounts use TLS. End-to-end ALB target TLS, WAF, CDN, image baking, EFS backups and central log shipping are explicit production hardening tasks, not implemented claims. The shallow health check deliberately avoids replacing every instance on a shared DB failure.

## In this repository

All deployable lab files are under `golang/content/labs/aws-wordpress/`; start with its README. Download individual files from `../labs/aws-wordpress/README.md`, or use your feature-branch checkout. The `modules/network` module owns the VPC/subnets/NATs. Root `main.tf` owns app, data and identity; `user-data.sh.tftpl` boots the instances. Examples are not imported by the live repository Terraform or GitOps manifests.

## Lab

1. In the lab directory, initialize without a backend and validate. Read every resource and the network module. Copy `terraform.tfvars.example` to a private ignored `.tfvars` file; replace region, certificate ARN, hostname, WordPress version/hash and your unique lab name. Keep passwords out of it: RDS manages the master password. For a real application, bootstrap a dedicated limited DB user and avoid continued master use.

```bash
cd golang/content/labs/aws-wordpress
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}'
terraform init -backend=false
terraform fmt -check -recursive
terraform validate
cp terraform.tfvars.example terraform.tfvars
# Edit and review terraform.tfvars locally before the next command.
terraform plan -out=lab.tfplan
terraform show -no-color lab.tfplan
```

2. Verify two AZs, two NATs, app/database private addressing, SG references, IMDSv2 and encrypted storage. Review the AWS 05 backend setup if using shared state. Inspect cost and account one last time. **The following command creates paid resources; run only after your own explicit budget decision.**

```bash
terraform apply lab.tfplan
terraform output
```

3. Create a CNAME from the chosen lab hostname to the `alb_dns_name` output (use an alias if managing the hosted zone appropriately). Wait for DNS. The ALB rejects HTTP by redirecting to HTTPS; the certificate must match the hostname. Bootstrap validates the downloaded WordPress archive hash before unpacking and serializes shared EFS initialization across instances. Allow several minutes for packages, EFS mount and PHP setup; inspect cloud-init through SSM if targets stay unhealthy.

4. Finish WordPress's web installer promptly from your browser using a unique administrator password and disposable content. Add a post and an upload. Check each target's local readiness through SSM. Access through the public name, not the ALB hostname, to validate certificate/name behavior.

```bash
curl -I "https://$(terraform output -raw site_hostname)/"
curl -fsS "https://$(terraform output -raw site_hostname)/healthz.php"
curl -fsS "https://$(terraform output -raw site_hostname)/readyz.php"
aws elbv2 describe-target-health --target-group-arn "$(terraform output -raw target_group_arn)" --query 'TargetHealthDescriptions[].{ID:Target.Id,Health:TargetHealth.State}'
```

5. Run AWS 03's single-target failure drill while recording HTTPS results. Verify the post and uploaded image remain available after replacement. EFS and RDS protect against this instance-loss event, but you have not yet proved AZ failover or historical restore. Design the separate restore drill from AWS 04 and record RPO/RTO assumptions honestly.

## Validation

Acceptance evidence: `terraform validate`; reviewed resource plan; issued regional certificate; HTTPS without `-k`; two healthy targets in separate AZs; no public app IPs/SSH/DB; EFS mount with TLS; readiness proves a DB query; app IAM role can retrieve exactly its DB secret; post/upload survive one replacement; CloudWatch alarm exists; destroy inventory shows no residual chargeable lab resources.

Demonstrate a denied flow (direct external DB access), an allowed flow (ALB to app to DB) and identify which route/SG/IAM rule authorizes each boundary. Keep sanitized screenshots and a short architecture decision record. Never commit state, plan, logs with secrets or generated configuration.

## Troubleshooting

| Incident | First evidence | Recovery |
| --- | --- | --- |
| TLS name error | ACM region/status and DNS hostname | Fix certificate/name; do not disable verification |
| Targets never register healthy | ASG activity, cloud-init, EFS DNS/2049, archive hash | Correct bootstrap input/dependency, refresh deliberately |
| DB 500 after secret rotation | Local generated DB config versus current secret version | Re-run secret-config refresh on instances; a production rotation hook is required |
| Posts visible, media missing | Shared EFS mount and file paths/permissions | Restore shared mount, not sticky-session masking |
| Terraform destroy fails | Dependency and RDS/secret finalization states | Wait for managed deletions; inspect exact failure before retry |

The RDS-managed credential is retrieved at boot; this example does not implement automatic in-place credential reload. For long-running use, implement and rehearse a rotation hook or connection strategy. This capstone intentionally uses a master account for initial WordPress setup; document the privilege reduction to a dedicated schema user before treating it as production.

## Cleanup

Remove the lab DNS record. Stop test traffic and SSM sessions. Inspect the destroy plan, then explicitly run it in the same lab directory and backend:

```bash
terraform plan -destroy -out=destroy.tfplan
terraform show -no-color destroy.tfplan
terraform apply destroy.tfplan
terraform state list
rm -f lab.tfplan destroy.tfplan
```

This ephemeral lab sets RDS deletion protection off and skips a final snapshot; it is destructive. Preserve any needed evidence/data first. Confirm no ASG/EC2, ALB, NAT, EIP, RDS, EFS/mount target remains for the lab prefix. Check managed secret deletion and manually created snapshots/backups separately. The separately bootstrapped state bucket is deliberately retained. Removing local state or stopping EC2 alone does not stop the bill.

## Interview preparation

**Why EFS and not local EBS for uploads?** Instance-local disks do not supply a shared multi-writer filesystem across independent ASG instances. EFS provides shared access but adds a dependency, permissions and backup requirements. An object-storage upload design is an alternative with different application integration.

**Is this architecture production-ready?** It demonstrates two-AZ compute/data boundaries, role-based secrets and TLS ingress. It still needs dedicated DB users, credential refresh, tested restore, hardened immutable images, centralized logs, patching, release controls and measured capacity/SLOs. State limitations directly.

**How would you explain this in five minutes?** Start from availability and data-loss requirements, draw the packet/identity/state paths, explain two tradeoffs (NAT cost and EFS sharing), show a timed incident and recovery, then outline DR and cost evidence.

## Verify your understanding

Present a five-minute design review and a ten-minute incident walkthrough. Keep a clear distinction between executed observations and planned extensions. Mark complete after runtime evidence, or label your evidence as static-only and schedule the paid validation separately.

## Arabic takeaway

المشروع النهائي خدمة WordPress كاملة: ALB بشهادة TLS، سيرفرات خاصة في AZs مختلفة، EFS للملفات وRDS للداتا. اثبت إن الخدمة والداتا فضلت موجودة بعد استبدال instance، وبعدها امسح كل موارد اللاب وراجع الفاتورة.

## Sources

- [AWS WordPress reference architecture](https://github.com/aws-samples/aws-refarch-wordpress)
- [RDS-managed master passwords](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html)
- [EFS mount helper and TLS](https://docs.aws.amazon.com/efs/latest/ug/efs-mount-helper.html)
- [AWS Well-Architected](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html)
