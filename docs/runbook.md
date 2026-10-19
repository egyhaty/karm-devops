# Operations Runbook

Commands below use the namespaces and workload names in this cluster. Start with Argo CD and Kubernetes events, then check the affected pod logs and the latest change in Git.

## Initial response

1. Check whether the issue affects the learning platform in `learning-lab`, `nodejs`, monitoring, or the cluster itself.
2. Check the Argo CD application status and recent Git changes.
3. Use events and pod logs to identify the failing component.
4. If a rollout caused the issue, revert the Git change and watch Argo CD reconcile it.
5. Note the time, cause, and fix for the next time it happens.

## Useful commands

```bash
kubectl get pods -A
kubectl get events -A --sort-by=.lastTimestamp
kubectl get nodes
kubectl get applications -n argocd
kubectl get deployments -n learning-lab
kubectl get deployments -n default
kubectl get pods -n monitoring
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
- Revert the Git change and confirm Argo CD has rolled back the workload.
- Check the public `/healthz` and sign-in routes after the rollout. Confirm metrics through Prometheus targets; the application metrics port is private to the cluster.

## Node pressure

- Check node conditions and allocatable resources.
- Identify pods with high usage or excessive requests.
- Review pending pods and scheduling events.
- Confirm whether eviction, disk pressure, memory pressure, or networking is involved.
- Check Longhorn volume health if a pod is waiting on a PVC.
- Make capacity and workload changes through Git or Terraform, depending on which manages the resource.

## Certificate issue

- Inspect certificate and certificate-request resources.
- Review cert-manager events and controller logs.
- Verify DNS, issuer configuration, challenge reachability, and ingress routing.
- Check the public route after cert-manager reports the certificate as Ready.

## Post-incident checklist

- Record impact and duration.
- Identify the triggering change and root cause.
- Record detection and recovery times.
- Add or improve an alert, test, policy, or runbook step.
- Review whether the incident exposed a capacity, security, or process gap.
