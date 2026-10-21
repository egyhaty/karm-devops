# AWS WordPress capstone (paid, learner-run)

Use the AWS 07 lesson for cost gates, commands, failure drills and cleanup. This directory is independent from root `terraform/`, Kubernetes and production databases. It has no automatic apply workflow.

Files (download to the same relative layout, including the [provider lockfile](./.terraform.lock.hcl)):

- [versions.tf](./versions.tf), [variables.tf](./variables.tf), [main.tf](./main.tf)
- [user-data.sh.tftpl](./user-data.sh.tftpl)
- [modules/network/main.tf](./modules/network/main.tf)
- [terraform.tfvars.example](./terraform.tfvars.example)
- [backend.s3.tf.example](./backend.s3.tf.example) (inactive; separately bootstrap backend)

Requirements: Terraform >=1.10; AWS CLI v2; SSM plugin; sandbox deployment permissions and quotas; an issued ACM certificate in the selected region; matching hostname/DNS control; a reviewed official WordPress release and verified archive SHA-256. Set `client_cidr` to your trusted public test IP/CIDR: ingress is restricted during first-run WordPress setup. Changing networks requires a reviewed rule update. Never use 0.0.0.0/0 for the unauthenticated installer.

Use `https://wordpress.org/download/releases/` to choose a release. Download its official tar.gz, verify the source/release according to your supply-chain policy, compute `shasum -a 256` locally and enter that exact hash. Computing a hash alone does not establish publisher authenticity; the pin ensures instances receive the reviewed bytes. Do not invent a release hash or disable the check.

```bash
terraform init -backend=false
terraform validate
cp terraform.tfvars.example terraform.tfvars
# Replace EVERY placeholder, verify identity/cost, then:
terraform plan -out=lab.tfplan
# Paid resources: explicit learner decision required before applying.
terraform apply lab.tfplan
```

Set a CNAME for `site_hostname` to `alb_dns_name`. Complete the web installer promptly with disposable data and a unique password. No public app IPs or SSH. ALB HTTPS terminates TLS; private ALB→Apache uses HTTP. EFS mounts use TLS; RDS connections request TLS, but this minimal PHP client does not implement explicit RDS CA/hostname verification. Add that verification before production use.

Runtime credentials come from the RDS-managed secret via the instance role. They are not Terraform variables. Boot writes `/etc/wordpress-db.php` with root:apache 0640. For a rotation exercise run `sudo /usr/local/sbin/cloud-lab-refresh-db` on each instance and verify readiness. Automatic rotation/reload is not implemented. The initial WordPress DB user is the managed master user: reduce privileges for real workloads.

Other explicit limits: mutable latest AL2023 AMI selection (record/pin the chosen AMI for repeatable releases), package installation at boot, no WAF/CDN, no EFS backup policy, no central guest log shipping, no alarm notification destination. AZ compute resilience is not a tested full-region DR design. ASG-managed desired capacity should be reviewed when combining target tracking with later Terraform applies.

Cleanup: remove DNS, review `terraform plan -destroy -out=destroy.tfplan`, then `terraform apply destroy.tfplan`. RDS final snapshot is intentionally skipped and deletion protection disabled for an ephemeral lab. Confirm no lab NAT/EIP, ALB, ASG, EC2/EBS, RDS, EFS remains; account for separately created snapshots and retained managed-secret deletion. Independent state backend is retained.
