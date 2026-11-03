#!/usr/bin/env python3
"""Turn a reliability snapshot into an evidence-backed incident report."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

RUNBOOKS = {
    "node_not_ready": {
        "title": "Node readiness degradation",
        "severity": "high",
        "why": "A Kubernetes node is not Ready; workloads may be unavailable or unschedulable.",
        "steps": ["Check kubelet and container runtime health on the affected node.", "Confirm network and disk pressure conditions.", "Cordon only after workload impact is understood; do not drain automatically."],
        "runbook": "docs/runbook.md#node-readiness",
    },
    "pod_failed": {
        "title": "Failed workload detected",
        "severity": "medium",
        "why": "A workload is in Failed phase and requires owner/context before restart or rollback.",
        "steps": ["Inspect pod events and the previous container termination reason.", "Compare the last deployment revision with the last healthy revision.", "Roll back only after approval and a captured evidence snapshot."],
        "runbook": "docs/troubleshooting.md#workloads",
    },
    "warning_event": {
        "title": "Warning event concentration",
        "severity": "medium",
        "why": "Kubernetes emitted a Warning event that may explain degraded service behavior.",
        "steps": ["Correlate the event with the affected owner and deployment timeline.", "Check whether the warning is repeating or already resolved.", "Record the verification result in the incident timeline."],
        "runbook": "docs/runbook.md#events",
    },
}


def classify(snapshot: dict) -> list[dict]:
    findings = []
    for item in snapshot.get("unhealthy_objects", []):
        key = "node_not_ready" if item.get("kind") == "Node" else "pod_failed"
        rule = RUNBOOKS[key]
        findings.append({"id": f"finding-{len(findings)+1:02d}", "type": key, "resource": item, **rule})
    if snapshot.get("warning_events"):
        rule = RUNBOOKS["warning_event"]
        findings.append({"id": f"finding-{len(findings)+1:02d}", "type": "warning_event", "resource": {"count": len(snapshot["warning_events"])}, **rule})
    return findings


def build_report(snapshot: dict) -> dict:
    findings = classify(snapshot)
    severity = "critical" if any(f["severity"] == "high" for f in findings) and len(findings) >= 3 else ("high" if any(f["severity"] == "high" for f in findings) else ("medium" if findings else "healthy"))
    now = datetime.now(timezone.utc).isoformat()
    return {
        "schema_version": "reliability.incident/v1",
        "generated_at": now,
        "status": "attention_required" if findings else "healthy",
        "severity": severity,
        "read_only": True,
        "mutations_executed": 0,
        "source_snapshot": snapshot.get("schema_version"),
        "findings": findings,
        "timeline": [
            {"at": snapshot.get("generated_at", now), "kind": "observation", "message": "Read-only Kubernetes evidence snapshot collected."},
            *[{"at": now, "kind": "finding", "message": f"{f['title']}: {f['why']}"} for f in findings],
            {"at": now, "kind": "decision", "message": "No remediation executed; approval and a fresh evidence check are required."},
        ],
    }


def markdown(report: dict) -> str:
    lines = [f"# Reliability Incident Report — {report['severity'].upper()}", "", f"Status: **{report['status']}**", f"Generated: `{report['generated_at']}`", "", "## Operating boundary", "", "- Read-only evidence collection", "- No automatic remediation", "- Mutations executed: `0`", "", "## Findings", ""]
    for f in report["findings"]:
        resource = f["resource"]
        identity = "/".join(str(resource.get(k, "")) for k in ("namespace", "name") if resource.get(k)) or resource.get("name", "cluster")
        lines += [f"### {f['id']} · {f['title']}", "", f"- Resource: `{identity}`", f"- Why it matters: {f['why']}", f"- Runbook: `{f['runbook']}`", "- Proposed next steps:"] + [f"  - {step}" for step in f["steps"]] + [""]
    lines += ["## Timeline", ""] + [f"- `{event['at']}` · **{event['kind']}** — {event['message']}" for event in report["timeline"]]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot")
    parser.add_argument("--out", default="reliability-incident")
    args = parser.parse_args()
    report = build_report(json.loads(Path(args.snapshot).read_text()))
    Path(args.out + ".json").write_text(json.dumps(report, indent=2) + "\n")
    Path(args.out + ".md").write_text(markdown(report))
    print(json.dumps({"status": report["status"], "severity": report["severity"], "findings": len(report["findings"]), "timeline_events": len(report["timeline"])}))


if __name__ == "__main__":
    main()
