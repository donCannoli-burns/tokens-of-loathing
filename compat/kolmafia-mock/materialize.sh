#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MOCK_DIR=""
MOCK_REF="${KOLMAFIA_MOCK_REF:-5c53bf4a5ee64d84710e7788409862bd8d2a1661}"
MOCK_REPO="${KOLMAFIA_MOCK_REPO:-https://github.com/loathers/kolmafia-mock.git}"
RUN_CLIENT_TESTS=1

usage() {
  cat <<'EOF'
Usage:
  materialize.sh --mock-dir PATH [options]

Options:
  --mock-dir PATH      destination/working kolmafia-mock checkout (required)
  --mock-ref REF       upstream kolmafia-mock ref
  --mock-repo URL      upstream kolmafia-mock repository
  --skip-client-tests  skip tokens-of-loathing client unit tests
  -h, --help           show help

The target mock directory is disposable test infrastructure. If it already
exists and is a Git checkout, tracked/untracked compatibility edits are reset
before the pinned upstream ref is reapplied.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mock-dir) MOCK_DIR="$2"; shift 2 ;;
    --mock-ref) MOCK_REF="$2"; shift 2 ;;
    --mock-repo) MOCK_REPO="$2"; shift 2 ;;
    --skip-client-tests) RUN_CLIENT_TESTS=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$MOCK_DIR" ]]; then
  echo "--mock-dir is required" >&2
  exit 2
fi

MOCK_DIR="$(mkdir -p "$(dirname "$MOCK_DIR")" && cd "$(dirname "$MOCK_DIR")" && pwd)/$(basename "$MOCK_DIR")"
ASSET_DIR="$MOCK_DIR/.kolmafia-mock-compat"
PACK_DIR="$ASSET_DIR/pack"
SQLITE_PATH="$ASSET_DIR/dol.sqlite"
DATA_URL="${DATA_OF_LOATHING_URL:-https://data.loathers.net/dol.sqlite}"

echo "== prepare pinned upstream kolmafia-mock =="
if [[ -e "$MOCK_DIR" && ! -d "$MOCK_DIR/.git" ]]; then
  echo "Refusing to replace non-Git path: $MOCK_DIR" >&2
  exit 3
fi

if [[ ! -d "$MOCK_DIR/.git" ]]; then
  git clone --quiet "$MOCK_REPO" "$MOCK_DIR"
else
  git -C "$MOCK_DIR" reset --hard HEAD >/dev/null
  git -C "$MOCK_DIR" clean -fd >/dev/null
  git -C "$MOCK_DIR" remote set-url origin "$MOCK_REPO"
  git -C "$MOCK_DIR" fetch --tags origin
fi

git -C "$MOCK_DIR" checkout --detach "$MOCK_REF"
MOCK_HEAD="$(git -C "$MOCK_DIR" rev-parse HEAD)"

mkdir -p "$PACK_DIR"
printf '%s\n' '.kolmafia-mock-compat/' >> "$MOCK_DIR/.git/info/exclude"

echo "== install tokens-of-loathing workspace =="
cd "$ROOT"
corepack enable >/dev/null 2>&1 || true
yarn install --immutable

if [[ "$RUN_CLIENT_TESTS" -eq 1 ]]; then
  echo "== deterministic client tests =="
  yarn workspace data-of-loathing test
fi

echo "== build client package =="
yarn workspace data-of-loathing build

echo "== pack client into mock compatibility assets =="
rm -f "$PACK_DIR"/data-of-loathing-*.tgz
(
  cd "$ROOT/packages/client"
  npm pack --pack-destination "$PACK_DIR" --silent >/dev/null
)
CLIENT_TARBALL="$(find "$PACK_DIR" -maxdepth 1 -type f -name 'data-of-loathing-*.tgz' | head -n1)"
test -n "$CLIENT_TARBALL"

cp "$ROOT/compat/kolmafia-mock/data.ts" "$MOCK_DIR/src/data.ts"

node - "$MOCK_DIR/package.json" "$CLIENT_TARBALL" <<'NODE'
const fs = require("node:fs");
const [packagePath, tarball] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
pkg.dependencies["data-of-loathing"] = `file:${tarball}`;
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");
NODE

echo "== install compatible kolmafia-mock =="
(
  cd "$MOCK_DIR"
  corepack enable >/dev/null 2>&1 || true
  yarn install --no-immutable
)

echo "== download one SQLite snapshot =="
node - "$DATA_URL" "$SQLITE_PATH" <<'NODE'
const fs = require("node:fs/promises");
const [url, destination] = process.argv.slice(2);

(async () => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download SQLite snapshot: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 16 || bytes.subarray(0, 16).toString("utf8") !== "SQLite format 3\u0000") {
    throw new Error("Downloaded file is not a SQLite 3 database");
  }
  await fs.writeFile(destination, bytes);
  process.stdout.write(`sqlite_bytes=${bytes.length}\n`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

echo "== run original upstream kolmafia-mock tests =="
(
  cd "$MOCK_DIR"
  export KOLMAFIA_MOCK_DOL_SQLITE="$SQLITE_PATH"
  yarn vitest run
)

cat > "$ASSET_DIR/compat-manifest.json" <<EOF
{
  "schema": "tokens-of-loathing/kolmafia-mock-compat/v1",
  "tokens_repository": "https://github.com/donCannoli-burns/tokens-of-loathing",
  "tokens_ref": "$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo unknown)",
  "mock_repository": "$MOCK_REPO",
  "mock_ref_requested": "$MOCK_REF",
  "mock_commit": "$MOCK_HEAD",
  "sqlite_path": "$SQLITE_PATH",
  "status": "pass"
}
EOF

echo
echo "KOLMAFIA_MOCK_MATERIALIZED=PASS"
echo "mock_dir=$MOCK_DIR"
echo "mock_commit=$MOCK_HEAD"
echo "sqlite=$SQLITE_PATH"
