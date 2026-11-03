#!/usr/bin/env python3
"""Create a deterministic, read-only Kubernetes reliability evidence snapshot.

The collector deliberately shells out only to kubectl get commands. It never
executes a mutation and can be tested with a fixture JSON file.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def kubectl(resource: str) -> dict:
    proc = subprocess.run(
        ["kubectl", "get", resource, "-A", "-o", "json"],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(proc.stdout)


def load_input(path: str | None) -> dict[str, dict]:
    if path:
        payload = json.loads(Path(path).read_text())
        return {key: payload[key] for key in ("nodes", "pods", "events")}
    return {key: kubectl(resource) for key, resource in (("nodes", "nodes"), ("pods", "pods"), ("events", "events"))}


def prometheus_alerts(url: str | None) -> list[dict]:
    if not url:
        return []
    endpoint = url.rstrip("/") + "/api/v1/alerts"
    try:
        with urllib.request.urlopen(endpoint, timeout=8) as response:
            payload = json.load(response)
        if payload.get("status") != "success":
            raise ValueError("Prometheus returned a non-success status")
        return payload.get("data", {}).get("alerts", [])
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        return [{"state": "unavailable", "labels": {"alertname": "PrometheusUnavailable"}, "annotations": {"summary": str(exc)}}]


def node_ready(node: dict) -> bool:
    return any(c.get("type") == "Ready" and c.get("status") == "True" for c in node.get("status", {}).get("conditions", []))


def pod_phase(pod: dict) -> str:
    return pod.get("status", {}).get("phase", "Unknown")


def build_snapshot(data: dict[str, dict], alerts: list[dict] | None = None) -> dict:
    nodes = data["nodes"].get("items", [])
    pods = data["pods"].get("items", [])
    events = data["events"].get("items", [])
    unhealthy = []
    for node in nodes:
        if not node_ready(node):
            unhealthy.append({"kind": "Node", "name": node.get("metadata", {}).get("name"), "reason": "NotReady"})
    for pod in pods:
        phase = pod_phase(pod)
        if phase in {"Failed", "Unknown"}:
            unhealthy.append({"kind": "Pod", "namespace": pod.get("metadata", {}).get("namespace"), "name": pod.get("metadata", {}).get("name"), "reason": phase})
    warning_events = [
        {"namespace": e.get("metadata", {}).get("namespace"), "name": e.get("metadata", {}).get("name"), "reason": e.get("reason"), "message": e.get("message")}
        for e in events if e.get("type") == "Warning"
    ]
    return {
        "schema_version": "reliability.snapshot/v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "read_only": True,
        "mutations_executed": 0,
        "summary": {"nodes": len(nodes), "ready_nodes": sum(node_ready(n) for n in nodes), "pods": len(pods), "warning_events": len(warning_events), "unhealthy_objects": len(unhealthy)},
        "unhealthy_objects": unhealthy,
        "warning_events": warning_events[:100],
        "prometheus_alerts": alerts or [],
    }


def markdown(snapshot: dict) -> str:
    s = snapshot["summary"]
    state = "HEALTHY" if not snapshot["unhealthy_objects"] else "ATTENTION REQUIRED"
    lines = [f"# Reliability Snapshot — {state}", "", f"Generated: `{snapshot['generated_at']}`", "", "## Summary", "", f"- Nodes: **{s['ready_nodes']}/{s['nodes']} ready**", f"- Pods observed: **{s['pods']}**", f"- Warning events: **{s['warning_events']}**", f"- Unhealthy objects: **{s['unhealthy_objects']}**", "", "## Safety", "", "- Read-only collection", "- Mutations executed: `0`"]
    if snapshot["unhealthy_objects"]:
        lines += ["", "## Unhealthy objects", ""] + [f"- `{o.get('kind')}` `{o.get('namespace','')}/{o.get('name')}` — {o['reason']}" for o in snapshot["unhealthy_objects"]]
    if snapshot["warning_events"]:
        lines += ["", "## Warning events", ""] + [f"- `{e.get('namespace','')}/{e.get('name')}` — {e.get('reason')}: {e.get('message')}" for e in snapshot["warning_events"][:20]]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", help="JSON containing nodes, pods and events list responses")
    parser.add_argument("--out", default="reliability-snapshot", help="Output path without extension")
    parser.add_argument("--prometheus-url", help="Prometheus base URL, for example https://prometheus.murabba.net")
    args = parser.parse_args()
    snapshot = build_snapshot(load_input(args.fixture), prometheus_alerts(args.prometheus_url))
    Path(args.out + ".json").write_text(json.dumps(snapshot, indent=2) + "\n")
    Path(args.out + ".md").write_text(markdown(snapshot))
    print(json.dumps(snapshot["summary"], sort_keys=True))


if __name__ == "__main__":
    main()
