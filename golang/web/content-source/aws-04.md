## Learning objectives

Explain RDS Multi-AZ failover, backups and point-in-time restore (PITR) as separate mechanisms. Recover a versioned S3 object, define a WordPress consistency boundary across database and uploads, and defend an architecture's recurring cost.

## Prerequisites

Use a disposable account and AWS CLI v2. S3 storage and API calls may incur small charges; RDS, snapshots, replication and failover drills incur additional charges. No commands in this lesson should target an organizational backup bucket. Use a unique lab bucket and the same explicit region as earlier modules.

## The problem

Multi-AZ reduces a failure domain; it does not undo a malicious DELETE or a broken schema migration. A standard RDS Multi-AZ DB instance has a synchronous standby for availability, not a read-scaling endpoint. Read replicas serve a different purpose and can lag. A snapshot is a point in time; PITR uses retained backups/logs to restore a new DB instance within a supported window. Restoring creates a new endpoint and demands application cutover, credential checks and validation.

WordPress has two state stores: MySQL for posts/settings and the uploads filesystem. Restoring one without the other may leave broken media references. EFS sharing solves cross-instance visibility, not backup consistency. Choose an RPO (acceptable data loss interval) and RTO (acceptable service restoration time), coordinate a maintenance/write freeze where necessary, and measure end-to-end restore rather than only resource creation.

S3 versioning retains old versions and delete markers; it is not immutable backup by itself. An authorized attacker who can delete versions can still destroy data. Object Lock and separate-account copies address stronger threats but introduce retention and operational constraints. Encryption does not replace access control or deletion protection.

## In this repository

The AWS capstone uses RDS Multi-AZ with seven-day automated backup retention and encrypted EFS. Its short-lived lab destroy skips a final snapshot deliberately; a real deployment must change that lifecycle decision. `terraform/` and the live PostgreSQL database are outside this exercise. Do not restore or snapshot the production learning application.

## Lab

Create a versioned bucket containing only a harmless local text file. Use the bucket's versioned API to prove recovery rather than assume it:

```bash
export AWS_PROFILE=cloud-lab AWS_REGION=eu-west-1
BUCKET="cloud-learning-$(aws sts get-caller-identity --query Account --output text)-$(date +%s)"
aws s3api create-bucket --bucket "$BUCKET" --region "$AWS_REGION" --create-bucket-configuration LocationConstraint="$AWS_REGION"
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
printf 'revision one\n' > /tmp/cloud-learning-object.txt
VERSION_ONE=$(aws s3api put-object --bucket "$BUCKET" --key evidence.txt --body /tmp/cloud-learning-object.txt --query VersionId --output text)
printf 'bad revision\n' > /tmp/cloud-learning-object.txt
aws s3api put-object --bucket "$BUCKET" --key evidence.txt --body /tmp/cloud-learning-object.txt --query VersionId
aws s3api get-object --bucket "$BUCKET" --key evidence.txt --version-id "$VERSION_ONE" /tmp/cloud-learning-restored.txt
cmp /tmp/cloud-learning-restored.txt <(printf 'revision one\n')
```

The `LocationConstraint` example excludes us-east-1, which uses a different create-bucket request. Use the documented region-specific form rather than rerun blindly. For future buckets, explicitly configure default encryption and a TLS-only bucket policy as additional review tasks.

For a deployed capstone, inspect recovery capability without retrieving any password:

```bash
DB_ID=$(terraform -chdir=golang/content/labs/aws-wordpress output -raw db_identifier)
aws rds describe-db-instances --db-instance-identifier "$DB_ID" --query 'DBInstances[0].{MultiAZ:MultiAZ,Public:PubliclyAccessible,Encrypted:StorageEncrypted,Retention:BackupRetentionPeriod,LatestRestorable:LatestRestorableTime}'
aws rds describe-db-snapshots --db-instance-identifier "$DB_ID" --query 'DBSnapshots[].{ID:DBSnapshotIdentifier,Status:Status,Time:SnapshotCreateTime}'
```

Design a separately budgeted restore rehearsal: choose a time before a lab-only bad write; use `restore-db-instance-to-point-in-time` with a new target identifier, private subnet group and correct SGs. Wait for readiness, configure secret access, compare expected posts and media checksums, then rehearse DNS/config cutover. Do not execute a restore until you have budgeted the additional DB and chosen a target ID; include its deletion in the cleanup inventory. A successful API call without restored application data is not a passed DR test.

## Validation

`cmp` must exit zero for the restored object. Inventory all object versions and document how a delete marker differs from removing a version. Record RDS's latest-restorable time and compare it to the stated RPO, allowing for backup/log delay. For DR interview evidence, keep a timed runbook: detect, decide, restore DB and files, validate, cut over, observe. Static review alone cannot substantiate a measured RTO.

## Troubleshooting

| Symptom | Check | Consequence |
| --- | --- | --- |
| S3 object 'disappeared' | Versions and delete markers | Restore a retained version instead of recreating blindly |
| RDS failover causes app errors | DNS caching, connection retries, transaction retry semantics | Existing connections must reconnect |
| Restore is complete, app empty | Database name, restored timestamp, new endpoint | Infrastructure status is not data validation |
| Unexpected bill after destroy | Snapshots, EIPs, NAT, endpoints, old object versions | Inventory residual resources, not just EC2 |

Cost review: list ALB hours/LCUs, two NAT hours/data, two EC2 instances/EBS, Multi-AZ RDS/storage/backups, EFS storage, public IPv4, CloudWatch and transfer. Prices, quotas and region availability change. Compare two-AZ requirements to a temporary single-AZ learning alternative explicitly; never market the HA capstone as free-tier.

## Cleanup

Delete **every version and delete marker** in this dedicated bucket before deleting it. `aws s3 rm --recursive` alone does not remove old versions. This sample uses one delete request, sufficient for this two-version lab; production inventories need pagination/batching.

```bash
aws s3api list-object-versions --bucket "$BUCKET" --output json | jq '{Objects:([.Versions[]?,.DeleteMarkers[]?] | map({Key,VersionId})),Quiet:true}' > /tmp/cloud-learning-delete.json
aws s3api delete-objects --bucket "$BUCKET" --delete file:///tmp/cloud-learning-delete.json
aws s3api delete-bucket --bucket "$BUCKET"
rm -f /tmp/cloud-learning-object.txt /tmp/cloud-learning-restored.txt /tmp/cloud-learning-delete.json
```

Delete any extra restored DB and manual snapshot only after confirming they are lab-owned and no recovery evidence depends on them. Use the capstone destroy for Terraform-owned resources.

## Interview preparation

**Multi-AZ versus backup?** Multi-AZ addresses infrastructure availability. Backups and PITR address recovery from historical data loss. A logical corruption can reach the standby immediately; retain and test recoverable history.

**What does a credible RTO include?** Decision and provisioning time, data validation, application/secret reconfiguration, DNS cutover and user-facing checks. Reporting only snapshot restore time understates recovery.

**How would you cut costs safely?** Measure usage, rightsize and schedule disposable labs, investigate NAT/endpoints and transfer, choose retention intentionally, then consider commitment discounts for stable usage. Keep the availability/SLO tradeoff visible.

## Verify your understanding

Recover the first object byte-for-byte and prove the bucket is removed. Explain a two-store WordPress restore and defend a cost estimate with a dated calculator export rather than memorized prices.

## Arabic takeaway

الـ Multi-AZ بيحسن التوافر لكنه مش backup. جرّب restore حقيقي للداتا والملفات وقيس RPO وRTO. راقب NAT والـ snapshots ونسخ S3 القديمة؛ حذف الـ instances مش معناه إن كل التكلفة وقفت.

## Sources

- [RDS Multi-AZ](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html)
- [RDS PITR](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html)
- [S3 object versions](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html)
- [AWS Pricing Calculator](https://calculator.aws/)
