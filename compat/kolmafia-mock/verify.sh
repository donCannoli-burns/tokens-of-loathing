#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UPSTREAM_REPO="${KOLMAFIA_MOCK_REPO:-https://github.com/loathers/kolmafia-mock.git}"
UPSTREAM_REF="${KOLMAFIA_MOCK_REF:-5c53bf4a5ee64d84710e7788409862bd8d2a1661}"
WORK_ROOT="${KOLMAFIA_MOCK_COMPAT_WORK_ROOT:-$(mktemp -d)}"
MOCK_DIR="$WORK_ROOT/kolmafia-mock"

cleanup() {
  if [[ -z "${KOLMAFIA_MOCK_COMPAT_KEEP_WORK:-}" ]]; then
    rm -rf "$WORK_ROOT"
  else
    echo "Keeping work tree: $WORK_ROOT"
  fi
}
trap cleanup EXIT

mkdir -p "$WORK_ROOT"

bash "$ROOT/compat/kolmafia-mock/materialize.sh"   --mock-dir "$MOCK_DIR"   --mock-ref "$UPSTREAM_REF"   --mock-repo "$UPSTREAM_REPO"

echo
echo "KOLMAFIA_MOCK_COMPAT=PASS"
echo "upstream=$UPSTREAM_REPO"
echo "upstream_ref=$UPSTREAM_REF"
