#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$(cd "$ROOT/../.." && pwd)"

output="$($ROOT/install.sh --check "$SOURCE")"
[[ "$output" == *"Startup benchmark patch: already applied"* ]]
[[ "$output" == *"Extension bundle: present"* ]]

echo "installer checks passed"
