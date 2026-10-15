#!/usr/bin/env python3
"""Check source YAML, address consistency, and workload availability settings."""
import ipaddress
import pathlib

import yaml

root = pathlib.Path(__file__).resolve().parents[1]
excluded = {".git", ".terraform", "node_modules", "templates", "rendered", "vendor"}
files = [
    path for path in root.rglob("*")
    if path.is_file() and path.suffix in {".yaml", ".yml"}
    and not excluded.intersection(path.relative_to(root).parts)
]
for path in files:
    list(yaml.safe_load_all(path.read_text()))


def read(relative):
    return yaml.safe_load((root / relative).read_text())


inventory = read("infrastructure/nodes.yaml")
nodes = inventory["nodes"]
cluster_version = inventory["cluster"]["kubernetesVersion"]
assert cluster_version.startswith("v1."), "Use a fully pinned Kubernetes release"
assert inventory["cluster"]["ciliumVersion"], "Cilium must be pinned in the cluster inventory"
assert len(nodes) >= 3, "Three nodes are required for this topology"
assert sum("control-plane" in node["roles"] for node in nodes) >= 3
assert len({node["name"] for node in nodes}) == len(nodes), "Duplicate node names"
assert len({node["address"] for node in nodes}) == len(nodes), "Duplicate addresses"
assert len({node["vmid"] for node in nodes}) == len(nodes), "Duplicate VM IDs"
vip = inventory["cluster"]["ingressAddress"]
assert vip not in {node["address"] for node in nodes}
cilium = read("networking/cilium/values.yaml")
assert cilium["extraEnv"][0]["valueFrom"]["fieldRef"]["fieldPath"] == "status.hostIP"
assert inventory["cluster"]["apiEndpoint"] == f"https://{vip}:6443"
assert cilium["policyEnforcementMode"] == "default"
assert cilium["cni"]["customConf"] is False, "Migration mode must not be published as final"
pod_cidr = ipaddress.ip_network(cilium["ipam"]["operator"]["clusterPoolIPv4PodCIDRList"][0])
assert not pod_cidr.overlaps(ipaddress.ip_network(inventory["cluster"]["serviceCIDR"]))
assert all(ipaddress.ip_address(node["address"]) not in pod_cidr for node in nodes)
pool = read("networking/metallb/address-pool.yaml")
assert pool["spec"]["addresses"] == [f"{vip}/32"]
traefik = read("traefik/values.yaml")
assert traefik["deployment"]["replicas"] >= 3
assert traefik["service"]["annotations"]["metallb.io/loadBalancerIPs"] == vip
assert traefik["ports"]["kubeapi"]["exposedPort"] == 6443
api_routes = traefik["providers"]["file"]["content"]["tcp"]
assert api_routes["routers"]["kubernetes-api"]["tls"]["passthrough"] is True
api_backend = api_routes["services"]["kubernetes-api"]["loadBalancer"]
assert {server["address"] for server in api_backend["servers"]} == {
    f'{node["address"]}:6443' for node in nodes if "control-plane" in node["roles"]
}
assert api_backend["healthCheck"]["interval"] == "2s"
monitoring_app = read("argocd/apps/monitoring.yaml")
monitoring = yaml.safe_load(monitoring_app["spec"]["source"]["helm"]["values"])
grafana_persistence = monitoring["grafana"]["persistence"]
assert grafana_persistence["enabled"] is True
assert grafana_persistence["storageClassName"] == "longhorn"
prometheus_storage = monitoring["prometheus"]["prometheusSpec"]["storageSpec"]["volumeClaimTemplate"]
assert prometheus_storage["spec"]["storageClassName"] == "longhorn"
assert prometheus_storage["spec"]["resources"]["requests"]["storage"] == "10Gi"
alertmanager_storage = monitoring["alertmanager"]["alertmanagerSpec"]["storage"]["volumeClaimTemplate"]
assert alertmanager_storage["spec"]["storageClassName"] == "longhorn"
assert alertmanager_storage["spec"]["resources"]["requests"]["storage"] == "2Gi"
for name, filename in [("golang", "values-go.yaml"), ("nodejs", "values-node.yaml")]:
    values = read(f"charts/{filename}")
    minimum = values["scaling"]["min"]
    assert minimum >= 3 and values["scaling"]["max"] >= minimum
    assert values["pdb"]["minAvailable"] >= 2
    assert values["pdb"]["minAvailable"] < minimum, "PDB would prevent rolling maintenance"
    spread = values["topologySpreadConstraints"][0]
    assert spread["topologyKey"] == "kubernetes.io/hostname"
    assert spread["maxSkew"] == 1
    assert spread["matchLabelKeys"] == ["pod-template-hash"], "Spread each rollout independently"
    assert spread["labelSelector"]["matchLabels"]["app.kubernetes.io/instance"] == name
print(f"Parsed {len(files)} YAML files; topology, addressing, and availability checks passed")
