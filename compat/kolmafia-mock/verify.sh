#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UPSTREAM_REPO="${KOLMAFIA_MOCK_REPO:-https://github.com/loathers/kolmafia-mock.git}"
UPSTREAM_REF="${KOLMAFIA_MOCK_REF:-5c53bf4a5ee64d84710e7788409862bd8d2a1661}"
WORK_ROOT="${KOLMAFIA_MOCK_COMPAT_WORK_ROOT:-$(mktemp -d)}"
MOCK_DIR="$WORK_ROOT/kolmafia-mock"
PACK_DIR="$WORK_ROOT/pack"

cleanup() {
  if [[ -z "${KOLMAFIA_MOCK_COMPAT_KEEP_WORK:-}" ]]; then
    rm -rf "$WORK_ROOT"
  else
    echo "Keeping work tree: $WORK_ROOT"
  fi
}
trap cleanup EXIT

mkdir -p "$PACK_DIR"

echo "== install tokens-of-loathing workspace =="
cd "$ROOT"
corepack enable >/dev/null 2>&1 || true
yarn install --immutable

echo "== deterministic client tests =="
yarn workspace data-of-loathing test

echo "== build client package =="
yarn workspace data-of-loathing build

echo "== pack client =="
(
  cd "$ROOT/packages/client"
  npm pack --pack-destination "$PACK_DIR" --silent >/dev/null
)
CLIENT_TARBALL="$(find "$PACK_DIR" -maxdepth 1 -type f -name 'data-of-loathing-*.tgz' | head -n1)"
test -n "$CLIENT_TARBALL"

echo "== clone pinned kolmafia-mock =="
git clone --quiet "$UPSTREAM_REPO" "$MOCK_DIR"
git -C "$MOCK_DIR" checkout --detach "$UPSTREAM_REF"

cp "$ROOT/compat/kolmafia-mock/data.ts" "$MOCK_DIR/src/data.ts"

node - "$MOCK_DIR/package.json" "$CLIENT_TARBALL" <<'NODE'
const fs = require("node:fs");
const [packagePath, tarball] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
pkg.dependencies["data-of-loathing"] = `file:${tarball}`;
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");
NODE

echo "== install patched kolmafia-mock =="
(
  cd "$MOCK_DIR"
  corepack enable >/dev/null 2>&1 || true
  yarn install --no-immutable
)

echo "== run original upstream kolmafia-mock tests =="
(
  cd "$MOCK_DIR"
  yarn vitest run
)

echo
echo "KOLMAFIA_MOCK_COMPAT=PASS"
echo "upstream=$UPSTREAM_REPO"
echo "upstream_ref=$UPSTREAM_REF"
