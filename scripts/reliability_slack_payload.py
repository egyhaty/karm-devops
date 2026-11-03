#!/usr/bin/env python3
"""Render a report as a Slack webhook payload without sending it."""
import argparse
import json
from pathlib import Path


def payload(report: dict) -> dict:
    lines = [
        f"*Karm Reliability* · `{report['severity'].upper()}` · `{report['status']}`",
        f"Findings: *{len(report['findings'])}* · Remediation executed: *no*",
    ]
    for finding in report["findings"][:5]:
        lines.append(f"• *{finding['title']}* — {finding['why']}")
    lines.append("Approval is required before any change.")
    return {"text": "\n".join(lines)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("report")
    args = parser.parse_args()
    print(json.dumps(payload(json.loads(Path(args.report).read_text())), indent=2))


if __name__ == "__main__":
    main()
