## Learning objectives

Explain who may assume a role versus what that role may do. Diagnose identity-policy, resource-policy and organization-boundary denies. Retrieve a secret without printing its payload. Map Kubernetes workload identity concepts to EC2 instance profiles and STS sessions.

## Prerequisites

Complete AWS 01. Work in an account where an administrator has permitted a lab role prefix. You need IAM create/delete/simulate permissions only within that sandbox. Do not add AdministratorAccess as a troubleshooting shortcut. The local policy lab creates no secrets or compute. Secret inspection later uses only the capstone's generated secret.

## The problem

A role is not a long-lived access key. Its trust policy permits a principal to request an STS session; its permissions policy authorizes actions after assumption. An EC2 instance profile delivers role credentials through instance metadata. IMDSv2 reduces metadata abuse but does not compensate for a role allowed to read every secret. Workloads should ask the SDK credential chain for credentials and handle rotation rather than copy credentials into `.env`.

Identity policies, resource policies, session policies, permissions boundaries and service control policies can all constrain effective access. Explicit deny wins. Same-account and cross-account evaluation differ; cross-account access generally needs both sides to allow. KMS adds another authorization boundary for customer-managed keys. A Secrets Manager allow does not automatically supply `kms:Decrypt` where that key requires it.

## In this repository

The capstone's `main.tf` grants `secretsmanager:GetSecretValue` for one RDS-managed secret, uses the EC2 service principal in its trust policy, and enables IMDSv2 in the launch template. Existing app secrets under `sealed-secrets/` are unrelated. Never copy those into the cloud labs.

## Lab

Confirm identity, then write a trust document and a scoped permissions document. Substitute the account returned by STS, not an account copied from a tutorial:

```bash
export AWS_PROFILE=cloud-lab AWS_REGION=eu-west-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
cat > /tmp/cloud-lab-trust.json <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
cat > /tmp/cloud-lab-secret-policy.json <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"secretsmanager:GetSecretValue","Resource":"arn:aws:secretsmanager:${AWS_REGION}:${ACCOUNT_ID}:secret:cloud-lab-*"}]}
JSON
ROLE_ARN=$(aws iam create-role --role-name cloud-learning-instance --assume-role-policy-document file:///tmp/cloud-lab-trust.json --query Role.Arn --output text)
aws iam put-role-policy --role-name cloud-learning-instance --policy-name OneSecretPrefix --policy-document file:///tmp/cloud-lab-secret-policy.json
aws iam simulate-principal-policy --policy-source-arn "$ROLE_ARN" --action-names secretsmanager:GetSecretValue secretsmanager:DeleteSecret --resource-arns "arn:aws:secretsmanager:${AWS_REGION}:${ACCOUNT_ID}:secret:cloud-lab-example" --query 'EvaluationResults[].{Action:EvalActionName,Decision:EvalDecision}'
```

Expect GetSecretValue allowed and DeleteSecret implicitly denied in this identity-policy simulation. Repeat against a secret ARN outside the prefix: GetSecretValue should be denied. The IAM simulator is useful evidence about the supplied policy, not proof of end-to-end live access or all SCP/resource-policy effects.

Try explaining why `aws sts assume-role --role-arn "$ROLE_ARN" ...` from your human CLI is denied: the trust principal here is EC2, not your human identity. Do not change it to `Principal: "*"` to make a test pass. For a real STS experiment, have the sandbox administrator supply a separate role that trusts your exact lab principal and grants read-only access; call `aws sts assume-role --role-arn "$READONLY_ROLE_ARN" --role-session-name interview-lab --query 'AssumedRoleUser.Arn'`. This proves assumption without exposing temporary keys.

After the capstone is deployed by the learner, enter an app instance using SSM and run:

```bash
aws sts get-caller-identity --query Arn --output text
aws secretsmanager describe-secret --secret-id "$LAB_SECRET_ARN" --query '{Rotation:RotationEnabled,LastChanged:LastChangedDate}'
aws secretsmanager get-secret-value --secret-id "$LAB_SECRET_ARN" --query VersionId --output text
```

The instance role intentionally allows GetSecretValue only; DescribeSecret may be denied. Record that as least-privilege evidence, not a broken app. Never request `SecretString` in shared terminal output. The bootstrap consumes it in memory to create a local configuration file.

## Validation

Keep the three simulator decisions and role ARN with the account redacted. Verify the policy does not allow deletion or unrelated secrets. On EC2, verify an assumed-role identity instead of an IAM user's access-key identity. Confirm the secret value is absent from user data, Terraform outputs and captured logs. The RDS-managed password remains service-managed; local app configuration must be refreshed if it rotates.

## Troubleshooting

| Failure | Investigate | Recovery |
| --- | --- | --- |
| AssumeRole AccessDenied | Caller identity, trust principal/conditions, caller permission | Fix the narrow trust or permission, not both blindly |
| GetSecretValue AccessDenied | Exact resource ARN and suffix, boundary/SCP, KMS key | Grant only missing scope after evidence |
| SDK has no credentials | Instance profile attachment, IMDS settings, credential-chain overrides | Remove stale environment keys; restore profile |
| Secret works until rotation | Cached credential lifetime and application reload | Refresh/reload configuration; plan overlap |

## Cleanup

```bash
aws iam delete-role-policy --role-name cloud-learning-instance --policy-name OneSecretPrefix
aws iam delete-role --role-name cloud-learning-instance
rm -f /tmp/cloud-lab-trust.json /tmp/cloud-lab-secret-policy.json
```

If you created an instance profile, remove its role and delete the profile before deleting the role. Do not delete the capstone role from this lab's commands; Terraform owns that separate role.

## Interview preparation

**Trust policy versus permission policy?** Trust determines who can obtain a session; permissions determine what the session can do. A successful assumption followed by S3 AccessDenied proves the first boundary passed, not the second.

**How do you reduce CI credential risk?** Use federation with short sessions, repository/environment-scoped trust, least-privilege roles, protected approvals and isolated state. Avoid access-key rotation chores by not issuing static CI keys.

**Is a masked Terraform output enough for secrets?** No. Sensitive values can still be stored in state and plans. Use workload retrieval, encrypted restricted state, and secret-safe logs. Marking a value sensitive changes display, not its persistence.

## Verify your understanding

Present an allow/deny matrix for two actions and two resources. Explain why a successful IAM simulation can still fail in a live organization. Demonstrate cleanup and identify which policy grants each permission used by the capstone.

## Arabic takeaway

الـ trust policy بتحدد مين يلبس الـ role، والـ permissions بتحدد يعمل إيه بعد كده. استخدم credentials مؤقتة من STS وخلّي التطبيق يقرأ secret محدد بهويته، بدل ما تحط مفاتيح ثابتة في الكود أو اللوجات.

## Sources

- [IAM policy evaluation](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)
- [Temporary role credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_use-resources.html)
- [Secrets Manager permissions](https://docs.aws.amazon.com/secretsmanager/latest/userguide/auth-and-access.html)
