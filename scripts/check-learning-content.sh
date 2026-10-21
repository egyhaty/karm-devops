#!/usr/bin/env bash
# Read-only content contract shared by image smoke tests and public checks.
set -euo pipefail
base="${1:?Usage: check-learning-content.sh BASE_URL}"
base="${base%/}"
check_dir="$(mktemp -d)"
trap 'rm -rf "$check_dir"' EXIT
fetch() { curl --fail --silent --show-error --max-time 15 "$base/$1" -o "$check_dir/$2"; }
fetch '' home.html
grep -Fq 'Murabba Learn' "$check_dir/home.html"
grep -Fq 'id="referenceCards"' "$check_dir/home.html"
fetch library-index.json catalog.json
jq -e '
  def ids($track): [.[] | select(.trackId == $track) | .id];
  (ids("aws") == [range(1;8) | "aws-0\(.)"]) and
  (ids("azure") == [range(1;8) | "azure-0\(.)"]) and
  ([.[].id] | index("docker") != null and index("git") != null and index("network-policy") != null)
' "$check_dir/catalog.json" >/dev/null
for track in aws azure; do
  grep -Fq "href=\"/tracks/$track.html\"" "$check_dir/home.html"
  fetch "tracks/$track.html" track.html
  grep -Fq "data-progress-id=\"$track-07\"" "$check_dir/track.html"
  fetch "lessons/$track-07.html" capstone.html
  grep -Fq 'class="reference-quiz"' "$check_dir/capstone.html"
  grep -Fq "data-progress-id=\"$track-07\"" "$check_dir/capstone.html"
done
echo 'Learning library, original references and both seven-module cloud tracks are available'
