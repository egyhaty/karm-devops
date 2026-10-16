#!/usr/bin/env bash
set -euo pipefail

GO_URL="${GO_URL:-https://go.murabba.net}"
NODE_URL="${NODE_URL:-https://node.murabba.net}"
PROMETHEUS_URL="${PROMETHEUS_URL:-https://prometheus.murabba.net}"
metrics_file="$(mktemp)"
trap 'rm -f "$metrics_file"' EXIT

check_app() {
  local name="$1" base="$2" attempt
  for attempt in {1..15}; do
    if curl --fail --silent --show-error --max-time 10 "$base/healthz" | grep -qx 'ok'; then
      break
    fi
    if (( attempt == 15 )); then
      echo "::error::$name health endpoint did not become ready: $base/healthz"
      return 1
    fi
    sleep 20
  done

  curl --fail --silent --show-error --max-time 10 "$base/metrics" -o "$metrics_file"
  grep -q '^http_requests_total' "$metrics_file" || {
    echo "::error::$name metrics endpoint is missing the expected application metric"
    return 1
  }
  echo "$name public health and metrics routes are healthy"
}

check_app "Go" "$GO_URL"
check_app "Node.js" "$NODE_URL"

# The public Prometheus endpoint uses Basic Auth. Configure the value as the
# GitHub Actions secret PROMETHEUS_BASIC_AUTH (username:password) to inspect
# target health; without it, public application checks still run.
if [[ -z "${PROMETHEUS_BASIC_AUTH:-}" ]]; then
  echo "::notice::Set PROMETHEUS_BASIC_AUTH to enable authenticated scrape-target checks"
  exit 0
fi

targets="$(curl --fail --silent --show-error --max-time 15 \
  --user "$PROMETHEUS_BASIC_AUTH" \
  "$PROMETHEUS_URL/api/v1/targets?state=active")"

jq -e '
  .status == "success" and
  ([.data.activeTargets[]? | select(.labels.job == "golang") | select(.health == "up")] | length > 0) and
  ([.data.activeTargets[]? | select(.labels.job == "nodejs") | select(.health == "up")] | length > 0)
' <<<"$targets" >/dev/null || {
  echo "::error::Prometheus does not report healthy Go and Node.js application scrape targets"
  exit 1
}
echo "Prometheus reports healthy Go and Node.js application scrape targets"
