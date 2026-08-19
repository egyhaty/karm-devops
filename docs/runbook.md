# Operations Runbook

This runbook provides a starting point for investigating common platform events. Adapt names, namespaces, domains, and alert destinations to the target environment.

## Initial response

1. Confirm the affected namespace, workload, and user impact.
2. Check recent Git commits, Argo CD sync activity, and cluster events.
3. Avoid making undocumented manual changes.
4. Capture timestamps, symptoms, commands, and decisions.
5. If impact is increasing, stop the rollout or roll back to the last known-good revision.

## Useful commands

```bash
kubectl get pods -A
kubectl get events -A --sort-by=.lastTimestamp
kubectl get nodes
kubectl get applications -n argocd
kubectl describe pod <pod> -n <namespace>
kubectl logs <pod> -n <namespace> --all-containers
kubectl rollout status deployment/<name> -n <namespace>
kubectl rollout history deployment/<name> -n <namespace>
```

## Failed rollout

- Check Argo CD application health and sync status.
- Inspect deployment conditions and ReplicaSet events.
- Verify image name, tag, registry access, probes, resources, and configuration.
- Compare the change with the last known-good Git revision.
- Revert the Git change or use a controlled Kubernetes rollback when immediate recovery is required.
- Document the root cause and add a preventive check.

## Node pressure

- Check node conditions and allocatable resources.
- Identify pods with high usage or excessive requests.
- Review pending pods and scheduling events.
- Confirm whether eviction, disk pressure, memory pressure, or networking is involved.
- Apply capacity or workload changes through the normal Git/IaC workflow.

## Certificate issue

- Inspect certificate and certificate-request resources.
- Review cert-manager events and controller logs.
- Verify DNS, issuer configuration, challenge reachability, and ingress routing.
- Do not disable TLS validation as a permanent workaround.

## Post-incident checklist

- Record impact and duration.
- Identify the triggering change and root cause.
- Record detection and recovery times.
- Add or improve an alert, test, policy, or runbook step.
- Review whether the incident exposed a capacity, security, or process gap.
