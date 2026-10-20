## The problem

A working network is not automatically an appropriately restricted network. A frontend needs to reach an API; that does not mean every Pod should be able to reach a database or send traffic to the internet.

Separate the questions first. A CNI connects Pods. A Service supplies a stable destination for selected backends. An ingress controller handles incoming application routing. A NetworkPolicy describes which selected Pod connections are allowed. DNS resolves names; it does not grant permission to connect.

## In this repository

Read `networking/cilium/values.yaml`, `terraform/cilium.tf`, `networking/policies/applications.yaml`, `traefik/values.yaml`, `networking/metallb/address-pool.yaml` and `golang/deploy/chart/templates/network-policy.yaml`.

```text
External browser → advertised service address → Traefik → Service → application
                                                                  ↓
                                                          database Service

Cilium: Pod connectivity and policy enforcement
MetalLB: advertise service addresses in this environment
Traefik: HTTP routing and TLS entry point
NetworkPolicy: permitted Pod traffic, not HTTP page routing
```

The learning namespace has policies for application, database, identity and monitoring traffic. The older default-namespace application policy has a broader namespace-based ingress rule. These are different scopes; do not assume every workload uses the same policy just because it is in this repository. Selectors and namespaces decide which Pods a policy actually affects.

### Why Cilium rather than Flannel?

The repository records Cilium, VXLAN tunnelling and standard NetworkPolicy. That supports a clear present-day requirement: Pod connectivity plus policy enforcement. It does not record the original selection discussion, so we cannot claim a historical benchmark or migration reason that we have not measured.

| Option | What it supplies | Tradeoff for this lab |
| --- | --- | --- |
| Flannel on its own | A network fabric connecting containers across hosts | Network policy enforcement requires another component |
| Cilium | Pod networking plus standard NetworkPolicy and additional Cilium-specific policy capabilities | More features and operational concepts to understand |
| Another policy-capable CNI | An alternative implementation of networking and enforcement | Evaluate compatibility, operations, visibility and measured requirements |

Flannel is not “bad networking.” Simpler connectivity can be a valid requirement. Cilium fits the current policy exercises without adding a separate enforcement component. Do not justify it with “we need eBPF” unless you can name and demonstrate the capability you actually need. Likewise, Hubble availability must be verified from configuration; installing Cilium does not prove every observability feature is enabled.

The manifests here use standard Kubernetes NetworkPolicy. Avoid switching to Cilium-specific resources until a required capability calls for them; portability and a smaller conceptual surface are useful.

### Read a policy accurately

`podSelector` selects target Pods in the policy's namespace. Once a Pod is selected for ingress isolation, permitted ingress is the union of matching allow rules from applicable policies. Egress isolation is separate. For a connection between two isolated Pods, the source egress and destination ingress must both allow it. Policies are additive; an empty allow list in one policy does not override an allow in another.

A `namespaceSelector` and `podSelector` in the same list item combine requirements. Separate list items offer alternative sources or destinations. Indentation can therefore change security meaning while still producing valid YAML.

## Lab

Use a disposable cluster with a CNI that enforces NetworkPolicy. Merely accepting the resource through the Kubernetes API is not proof of enforcement. This lab creates an isolated namespace and does not modify platform policies. Confirm the current context first:

```sh
kubectl config current-context
kubectl create namespace policy-lab
kubectl -n policy-lab create deployment web --image=nginx:alpine
kubectl -n policy-lab expose deployment web --port=80
kubectl -n policy-lab run allowed --image=busybox:1.37 --labels=access=web --command -- sleep 3600
kubectl -n policy-lab run blocked --image=busybox:1.37 --command -- sleep 3600
kubectl -n policy-lab rollout status deployment/web --timeout=90s
kubectl -n policy-lab wait --for=condition=Ready pod/allowed pod/blocked --timeout=90s
kubectl -n policy-lab exec allowed -- wget -T 3 -qO- http://web
kubectl -n policy-lab exec blocked -- wget -T 3 -qO- http://web
```

Both clients should reach the nginx page initially. If not, fix baseline scheduling, image pulling, Service endpoints or DNS before testing policy. A failed baseline cannot prove isolation.

### Isolate the server

Save this as `deny-web.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: isolate-web
  namespace: policy-lab
spec:
  podSelector:
    matchLabels:
      app: web
  policyTypes: [Ingress]
  ingress: []
```

```sh
kubectl apply -f deny-web.yaml
kubectl -n policy-lab exec allowed -- wget -T 3 -qO- http://web
kubectl -n policy-lab exec blocked -- wget -T 3 -qO- http://web
```

After enforcement converges, expect both new connections to time out. The Service still exists and the server can still be Ready. The connection is denied before it reaches the HTTP application. If both succeed, inspect labels, other policies and CNI enforcement; do not declare success based on `kubectl apply`.

### Allow only the labelled client

Save as `allow-web.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-labelled-client
  namespace: policy-lab
spec:
  podSelector:
    matchLabels:
      app: web
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels:
              access: web
      ports:
        - protocol: TCP
          port: 80
```

```sh
kubectl apply -f allow-web.yaml
kubectl -n policy-lab exec allowed -- wget -T 3 -qO- http://web
kubectl -n policy-lab exec blocked -- wget -T 3 -qO- http://web
kubectl -n policy-lab get networkpolicy
```

Expect the allowed client to succeed and the blocked client to time out. The isolation policy still exists. The new allow policy adds a permitted source; it does not need to delete the isolation resource.

### Isolate client egress, then restore the necessary paths

Save as `client-egress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: client-egress
  namespace: policy-lab
spec:
  podSelector:
    matchLabels:
      access: web
  policyTypes: [Egress]
  egress: []
```

```sh
kubectl apply -f client-egress.yaml
kubectl -n policy-lab exec allowed -- nslookup web
```

Expect name resolution to fail: egress to DNS is now blocked too. Edit `egress` to the following and reapply:

```yaml
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
    - to:
        - podSelector:
            matchLabels:
              app: web
      ports:
        - protocol: TCP
          port: 80
```

Before applying, confirm your cluster's DNS Pod labels and namespace. This example assumes CoreDNS behind the usual kube-dns Service; NodeLocal DNS or different CNI handling may require a different destination rule. The policy must match the actual packet path.

```sh
kubectl apply -f client-egress.yaml
kubectl -n policy-lab exec allowed -- nslookup web
kubectl -n policy-lab exec allowed -- wget -T 3 -qO- http://web
```

Expect resolution and the permitted HTTP request to work. You restored two separate dependencies. Opening all egress would conceal which dependency was missing.

### Cleanup

```sh
kubectl delete namespace policy-lab
```

This deletes all resources in the dedicated lab namespace. Do not substitute a namespace containing your real application.

## Troubleshooting

| Evidence | Interpretation to investigate |
| --- | --- |
| Name cannot resolve | DNS itself may be blocked or unavailable |
| Name resolves, new connection times out | Source egress, destination ingress, routes or unavailable endpoints |
| HTTP 404 or 500 | A server answered; investigate routing or the application |
| Policy exists but traffic is unchanged | Target labels, namespace, other allow policies and CNI enforcement |
| Allowed client fails after egress isolation | Both source egress and server ingress need to allow the connection |

Inspect `kubectl get pods --show-labels`, `kubectl get networkpolicy -o yaml` and `kubectl get endpointslice` in the lab namespace. If available, Cilium flow visibility can add evidence, but the lab must still be explainable without assuming an installed dashboard.

## Verify your understanding

Keep a four-row result table: baseline, ingress isolation, labelled allow, and restored egress. For each, record whether DNS works and whether each client's HTTP connection works. Explain why Flannel alone does not meet the policy enforcement requirement, and why Traefik does not replace a CNI. Finally, identify a real source-to-destination rule in this repository and explain every selector and port.

## Arabic takeaway

Cilium بيوصل الـ Pods وبيطبق السياسات؛ Traefik بيوجه طلبات الويب، وMetalLB بيعلن عنوان الخدمة. الـ NetworkPolicy لازم تتجرب باتصال مسموح واتصال ممنوع، ومينفعش ننسى DNS. اختيار Cilium مناسب لمتطلباتنا الحالية، مش دليل إن البدائل وحشة.

## Sources

- [Kubernetes NetworkPolicy](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
- [Cilium policy support](https://docs.cilium.io/en/stable/network/kubernetes/policy/)
- [Flannel project and networking scope](https://github.com/flannel-io/flannel#networking-details)
