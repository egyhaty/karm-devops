## Learning objectives

Connect launch-template versions to ASG replacements, trace ALB-to-target reachability and prove recovery of a two-AZ service. Choose health signals and CloudWatch alerts that reveal user impact instead of merely reporting a running process.

## Prerequisites

Read AWS 01 and 02 and inspect the capstone files before paying for compute. Static review is available without a cloud account. Runtime commands below require a learner-deployed disposable capstone from AWS 07 and its Terraform outputs. Use a short test window and preserve evidence before destroying the lab.

## The problem

Two EC2 instances are not automatically a highly available application. They need independent AZ placement, healthy target registration, shared durable state, valid routing and enough spare capacity. Launch templates describe future instances; updating a template does not silently rebuild every existing instance. Use a controlled instance refresh and observe the rollout rather than manually patching pets.

ALB operates at HTTP layer 7: it evaluates listeners, rules and target groups. Health checks use their configured port/path and accepted status range. A redirecting login page can accidentally look healthy, while a DB-dependent probe can trigger replacement storms during a transient database outage. This capstone's `/healthz.php` checks PHP and the shared filesystem; `/readyz.php` additionally queries MySQL. ALB uses the shallow health endpoint, and you monitor deep readiness separately. ASG ELB health checks replace unhealthy targets after a grace period; bootstrapping slower than that grace produces an endless replacement loop.

## In this repository

Read `labs/aws-wordpress/main.tf` for the HTTPS listener, target SG relationship, target-group health check, launch template, two-instance ASG and CloudWatch unhealthy-host alarm. The bootstrap in `user-data.sh.tftpl` installs the web stack, mounts EFS, verifies a WordPress archive hash and retrieves the database secret at runtime. It is a transparent learning bootstrap; production should bake a patched, tested AMI and rehearse upgrades.

## Lab

Start with a no-credentials review:

```bash
cd golang/content/labs/aws-wordpress
terraform init -backend=false
terraform validate
rg 'health_check|health_check_grace_period|metadata_options|instance_refresh' main.tf
```

For the optional deployed drill, set IDs from your own outputs:

```bash
TG_ARN=$(terraform output -raw target_group_arn)
ASG_NAME=$(terraform output -raw asg_name)
aws elbv2 describe-target-health --target-group-arn "$TG_ARN" --query 'TargetHealthDescriptions[].{Instance:Target.Id,State:TargetHealth.State,Reason:TargetHealth.Reason}'
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG_NAME" --query 'AutoScalingGroups[0].Instances[].{ID:InstanceId,AZ:AvailabilityZone,Health:HealthStatus}'
INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG_NAME" --query 'AutoScalingGroups[0].Instances[0].InstanceId' --output text)
aws ssm start-session --target "$INSTANCE_ID"
```

Inside that sandbox instance inspect `sudo cloud-init status --long`, `sudo journalctl -u httpd --no-pager -n 40`, `findmnt /var/www/html`, `curl -i http://localhost/healthz.php` and `curl -i http://localhost/readyz.php`. A boot error must be diagnosed before manipulating ALB matchers. Exit the session when done.

Controlled failure: in the lab only, stop Apache on one target with `sudo systemctl stop httpd`. Time the sequence: failed target checks, removal from serving traffic, ASG health change, replacement and recovery. Send HTTPS requests through the lab hostname during the event. Do not use SSH from the public internet. If you want a shorter drill without waiting for replacement, restart Apache immediately; record which recovery mechanism you actually exercised.

For a release exercise, change a non-secret bootstrap marker, plan, and inspect the new launch-template version plus ASG instance-refresh settings. Apply only after reviewing the separate AWS 07 cost gate. Use `aws autoscaling describe-instance-refreshes --auto-scaling-group-name "$ASG_NAME"` to follow progress. Capacity headroom and warmup control availability; a plan alone cannot prove zero downtime.

## Validation

Expect two healthy targets in distinct AZs after stabilization and HTTPS 200 for both health endpoints. Record outage duration, healthy-host count and replacement instance ID. Explain why an ALB health success is weaker than a successful WordPress database transaction. The included CloudWatch alarm enters ALARM if any target is unhealthy; it has no notification action until you connect an approved destination.

## Troubleshooting

| Symptom | Evidence | Correction |
| --- | --- | --- |
| Target timeout | App listener, ALB SG→app SG, NACL | Restore actual flow; don't widen all ports |
| Target response-code mismatch | Curl exact path and Host behavior | Fix endpoint/matcher contract |
| Repeated EC2 replacement | Cloud-init log, ASG activity, grace period | Fix bootstrap; choose realistic warmup |
| Healthy ALB, WordPress DB error | Deep probe, DB SG and credentials | Repair dependency, not listener |
| No SSM session | Agent status, profile, HTTPS egress/endpoints | Restore management path without public SSH |

CloudWatch metrics and alarms are not log shipping. EC2 application logs remain local unless an agent or another shipping path is configured; preserve them before instance replacement. CPU-based scaling is a starting signal, not a substitute for testing request latency and database capacity.

## Cleanup

Stop load generators and sessions. Revert the bootstrap marker if it was only an experiment. Use AWS 07's Terraform destroy procedure for the full stack; do not terminate individual resources behind Terraform and then abandon state. Confirm the ASG is gone so it cannot recreate instances.

## Interview preparation

**ALB 502 versus 503?** A 502 often involves an invalid/closed upstream response; a 503 can mean no usable registered targets. Inspect ALB access logs, target health reason codes, application logs and timing before concluding. Neither code uniquely identifies an SG issue.

**How do you roll out EC2 changes?** Publish an immutable image/template version, plan a bounded refresh with healthy capacity, monitor user-facing and dependency signals, and abort or roll forward to a known-good version. Database migrations need a compatible separate strategy.

**Why not replace every instance when the DB fails?** Replacement cannot repair a shared database outage and can amplify load. Separate process health from deep dependency monitoring and bound recovery actions.

## Verify your understanding

Explain a failed request from TLS listener to target process. Present a timeline of the controlled failure with evidence, then explain the difference between target removal, instance replacement and actual application recovery.

## Arabic takeaway

الـ ASG بيحافظ على العدد، والـ ALB بيختار targets سليمة، لكن التطبيق محتاج state مشتركة وhealth checks مناسبة. تحديث launch template لوحده مش معناه إن كل السيرفرات اتحدثت؛ راقب instance refresh وأثره على المستخدم.

## Sources

- [ALB target health checks](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html)
- [ASG instance refresh](https://docs.aws.amazon.com/autoscaling/ec2/userguide/asg-instance-refresh.html)
- [CloudWatch alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html)
