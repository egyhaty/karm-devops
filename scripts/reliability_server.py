#!/usr/bin/env python3
"""Small dependency-free Reliability Control Room API and dashboard server."""
from __future__ import annotations
import json, os, subprocess, importlib.util
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "docs/fixtures/reliability-snapshot.json"

def collect():
    fixture = os.environ.get("RELIABILITY_FIXTURE")
    if fixture:
        path = Path(fixture)
        if not path.is_absolute(): path = ROOT / path
        raw = json.loads(path.read_text())
        spec = importlib.util.spec_from_file_location('reliability_snapshot', ROOT / 'scripts/reliability_snapshot.py')
        mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
        return mod.build_snapshot(raw)
    try:
        spec = importlib.util.spec_from_file_location("reliability_snapshot", ROOT / "scripts/reliability_snapshot.py")
        mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
        data = mod.load_input(None)
        return mod.build_snapshot(data, mod.prometheus_alerts(os.environ.get("RELIABILITY_PROMETHEUS_URL")))
    except Exception as exc:
        data = json.loads(FIXTURE.read_text())
        data["collector_error"] = str(exc)
        return data

def report():
    snap = collect()
    import importlib.util
    spec = importlib.util.spec_from_file_location("reliability_report", ROOT / "scripts/reliability_report.py")
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    result = mod.build_report(snap); result["snapshot"] = snap
    return result

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/report": self.send_json(report()); return
        if path == "/api/health": self.send_json({"status":"ok","read_only":True}); return
        if path in ("/", "/index.html"):
            body = (ROOT / "docs/reliability-control-room.html").read_bytes()
            self.send_response(200); self.send_header("Content-Type","text/html; charset=utf-8"); self.send_header("Content-Length",str(len(body))); self.end_headers(); self.wfile.write(body); return
        self.send_error(404)
    def send_json(self, value):
        body=json.dumps(value).encode(); self.send_response(200); self.send_header("Content-Type","application/json"); self.send_header("Cache-Control","no-store"); self.send_header("Content-Length",str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self, *_): pass

if __name__ == "__main__":
    port=int(os.environ.get("PORT","8090")); print(f"Reliability Control Room: http://127.0.0.1:{port}", flush=True); ThreadingHTTPServer(("127.0.0.1",port),Handler).serve_forever()
