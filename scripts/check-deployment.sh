#!/usr/bin/env bash
set -euo pipefail

GO_URL="${GO_URL:-https://learn.murabba.net}"
NODE_URL="${NODE_URL:-https://node.murabba.net}"
PROMETHEUS_URL="${PROMETHEUS_URL:-https://prometheus.murabba.net}"
metrics_file="$(mktemp)"
trap 'rm -f "$metrics_file"' EXIT

check_health() {
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

  echo "$name health endpoint is healthy"
}

check_learning_lab() {
  local base="$1" issuer="$1/auth/realms/learning-lab/.well-known/openid-configuration" metadata page api_status metrics_status master_auth_status master_login_action_status master_account_status attempt
  check_health "Learning Lab" "$base"
  for attempt in {1..15}; do
    page="$(curl --fail --silent --max-time 10 "$base/" 2>/dev/null || true)"
    api_status="$(curl --silent --max-time 10 -o /dev/null -w '%{http_code}' "$base/api/me" 2>/dev/null || true)"
    metrics_status="$(curl --silent --max-time 10 -o /dev/null -w '%{http_code}' "$base/metrics" 2>/dev/null || true)"
    master_auth_status="$(curl --silent --max-time 10 -o /dev/null -w '%{http_code}' \
      "$base/auth/realms/master/protocol/openid-connect/auth?client_id=security-admin-console&redirect_uri=http%3A%2F%2Flocalhost%3A18080%2Fauth%2Fadmin%2Fmaster%2Fconsole%2F&response_type=code&scope=openid" \
      2>/dev/null || true)"
    master_login_action_status="$(curl --silent --max-time 10 -o /dev/null -w '%{http_code}' \
      "$base/auth/realms/master/login-actions/authenticate" 2>/dev/null || true)"
    master_account_status="$(curl --silent --max-time 10 -o /dev/null -w '%{http_code}' \
      "$base/auth/realms/master/account" 2>/dev/null || true)"
    metadata="$(curl --fail --silent --max-time 10 "$issuer" 2>/dev/null || true)"
    if grep -q 'Project Learning Lab' <<<"$page" && [[ "$api_status" == 401 && "$metrics_status" == 404 ]] &&
      [[ "$master_auth_status" == 200 || "$master_auth_status" == 302 ]] &&
      [[ "$master_login_action_status" != 404 && "$master_login_action_status" != 503 && "$master_login_action_status" != 000 ]] &&
      [[ "$master_account_status" == 200 || "$master_account_status" == 302 ]] &&
      jq -e --arg issuer "$base/auth/realms/learning-lab" '.issuer == $issuer and (.authorization_endpoint | startswith($issuer))' <<<"$metadata" >/dev/null 2>&1; then
      break
    fi
    if (( attempt == 15 )); then
      echo "::error::Learning Lab routes did not become ready with protected API and expected identity metadata"
      return 1
    fi
    sleep 20
  done
  echo "Learning Lab home, protected API, identity routes, and Keycloak admin sign-in are healthy"
}

check_node() {
  local name="Node.js" base="$1" metrics_file="$2"
  check_health "Node.js" "$base"
  curl --fail --silent --show-error --max-time 10 "$base/readyz" | grep -qx ready
  curl --fail --silent --show-error --max-time 10 "$base/api/properties" | jq -e '(.properties | type) == "array"' >/dev/null
  curl --fail --silent --show-error --max-time 10 "$base/" -o /dev/null
  curl --fail --silent --show-error --max-time 10 "$base/metrics" -o "$metrics_file"
  grep -q '^# TYPE ' "$metrics_file" || {
    echo "::error::$name metrics endpoint is not returning Prometheus exposition data"
    return 1
  }
  echo "$name public health and metrics routes are healthy"
}

check_learning_lab "$GO_URL"
check_node "$NODE_URL" "$metrics_file"

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
  ([.data.activeTargets[]? | select(.labels.job == "learning-lab") | select(.health == "up")] | length > 0) and
  ([.data.activeTargets[]? | select(.labels.job == "nodejs") | select(.health == "up")] | length > 0)
' <<<"$targets" >/dev/null || {
  echo "::error::Prometheus does not report healthy Learning Lab and Node.js application scrape targets"
  exit 1
}
echo "Prometheus reports healthy Learning Lab and Node.js application scrape targets"
