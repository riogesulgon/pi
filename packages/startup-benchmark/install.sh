#!/usr/bin/env bash
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_FILE="$BUNDLE_DIR/pi-core.patch"
AGENT_DIR="${PI_AGENT_DIR:-$HOME/.pi/agent}"
INSTALL_RUNTIME=0
CHECK_ONLY=0
SOURCE_DIR=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] <pi-source-directory>

Apply only the startup-benchmark core patch to an existing Pi source checkout.
The complete Pi runtime is never copied by this script.

Options:
  --check       Validate compatibility without changing files.
  --install     Build and install the patched coding-agent package globally.
  --agent-dir   Destination for the extension (default: $AGENT_DIR).
  -h, --help    Show this help.

Examples:
  $(basename "$0") --check ~/src/pi
  $(basename "$0") --install ~/src/pi
  PI_AGENT_DIR=/tmp/pi-agent $(basename "$0") ~/src/pi
EOF
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

while (($# > 0)); do
  case "$1" in
    --check) CHECK_ONLY=1; shift ;;
    --install) INSTALL_RUNTIME=1; shift ;;
    --agent-dir)
      (($# >= 2)) || fail "--agent-dir requires a path"
      AGENT_DIR="$2"
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    --) shift; SOURCE_DIR="${1:-}"; shift; break ;;
    -*) fail "unknown option: $1" ;;
    *)
      [[ -z "$SOURCE_DIR" ]] || fail "source directory specified more than once"
      SOURCE_DIR="$1"
      shift
      ;;
  esac
done

[[ -n "$SOURCE_DIR" ]] || { usage >&2; exit 2; }
[[ -f "$PATCH_FILE" ]] || fail "missing patch bundle: $PATCH_FILE"
[[ -f "$BUNDLE_DIR/extension/index.ts" ]] || fail "missing extension bundle"
[[ -x "$BUNDLE_DIR/extension/pi-startup-benchmark" ]] || fail "missing executable dashboard"
[[ -d "$SOURCE_DIR" ]] || fail "Pi source directory does not exist: $SOURCE_DIR"

git -C "$SOURCE_DIR" rev-parse --show-toplevel >/dev/null 2>&1 || fail "not a Git checkout: $SOURCE_DIR"
[[ -f "$SOURCE_DIR/packages/coding-agent/package.json" ]] || fail "not a compatible Pi source checkout: missing packages/coding-agent/package.json"
command -v git >/dev/null || fail "git is required"

if git -C "$SOURCE_DIR" apply --reverse --check "$PATCH_FILE" >/dev/null 2>&1; then
  PATCH_STATE="already applied"
elif git -C "$SOURCE_DIR" apply --check "$PATCH_FILE" >/dev/null 2>&1; then
  PATCH_STATE="ready to apply"
else
  fail "Pi source is incompatible with this patch; no files were changed"
fi

printf 'Pi source: %s\n' "$(git -C "$SOURCE_DIR" rev-parse --show-toplevel)"
printf 'Startup benchmark patch: %s\n' "$PATCH_STATE"
printf 'Extension bundle: present\n'

if ((CHECK_ONLY)); then
  printf 'Compatibility check passed; no files changed.\n'
  exit 0
fi

if [[ "$PATCH_STATE" == "ready to apply" ]]; then
  git -C "$SOURCE_DIR" apply --3way --whitespace=nowarn "$PATCH_FILE" \
    || fail "could not apply the startup-benchmark patch; resolve conflicts manually"
  printf 'Applied patched core files.\n'
else
  printf 'Core patch already present; skipped source changes.\n'
fi

EXT_DIR="$AGENT_DIR/extensions/startup-benchmark"
mkdir -p "$EXT_DIR" "$AGENT_DIR/bin"
install -m 0644 "$BUNDLE_DIR/extension/index.ts" "$EXT_DIR/index.ts"
install -m 0644 "$BUNDLE_DIR/extension/benchmark-store.ts" "$EXT_DIR/benchmark-store.ts"
install -m 0644 "$BUNDLE_DIR/extension/benchmark-report.ts" "$EXT_DIR/benchmark-report.ts"
install -m 0755 "$BUNDLE_DIR/extension/pi-startup-benchmark" "$AGENT_DIR/bin/pi-startup-benchmark"
printf 'Installed extension files under %s.\n' "$AGENT_DIR"

if ((INSTALL_RUNTIME)); then
  command -v npm >/dev/null || fail "npm is required for --install"
  (cd "$SOURCE_DIR" && npm run build)
  package_dir="$SOURCE_DIR/packages/coding-agent"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  (cd "$SOURCE_DIR" && npm pack --workspace @earendil-works/pi-coding-agent --pack-destination "$temp_dir" >/dev/null)
  tarball="$(find "$temp_dir" -maxdepth 1 -type f -name '*.tgz' -print -quit)"
  [[ -n "$tarball" ]] || fail "npm pack did not produce a coding-agent tarball"
  npm install -g "$tarball"
  printf 'Installed the patched Pi runtime globally.\n'
fi

printf '\nDone. Start benchmarked Pi with:\n  %s/bin/pi-startup-benchmark start\n' "$AGENT_DIR"
