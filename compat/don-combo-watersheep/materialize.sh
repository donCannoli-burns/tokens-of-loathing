#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LAB_DIR=""
MOCK_DIR_OVERRIDE=""
WATERSHEEP_URL=""
LIVE_RUNTIME=""
RUN_CLIENT_TESTS=1
ORDER_CHECK=0
SAMPLES_PER_CLASS=8

usage() {
  cat <<'EOF'
Usage:
  materialize.sh --lab-dir PATH [options]

Options:
  --lab-dir PATH            disposable lab root (required)
  --mock-dir PATH           reuse/materialize this disposable mock checkout
  --watersheep URL          run model benchmark after smoke tests
  --live-runtime PATH       require matching live don_combo evidence contract
  --samples-per-class N     labeled scenarios per class (default: 8)
  --order-check             add one cyclic option-order robustness pass
  --skip-client-tests       skip tokens-of-loathing client unit tests
  -h, --help                show help

The lab is offline/test infrastructure. It never reads KoLmafia cookies,
settings, sessions, or password material and it never authorizes a live action.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --lab-dir) LAB_DIR="$2"; shift 2 ;;
    --mock-dir) MOCK_DIR_OVERRIDE="$2"; shift 2 ;;
    --watersheep) WATERSHEEP_URL="$2"; shift 2 ;;
    --live-runtime) LIVE_RUNTIME="$2"; shift 2 ;;
    --samples-per-class) SAMPLES_PER_CLASS="$2"; shift 2 ;;
    --order-check) ORDER_CHECK=1; shift ;;
    --skip-client-tests) RUN_CLIENT_TESTS=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$LAB_DIR" ]]; then
  echo "--lab-dir is required" >&2
  exit 2
fi

case "$SAMPLES_PER_CLASS" in
  ''|*[!0-9]*) echo "--samples-per-class must be a positive integer" >&2; exit 2 ;;
esac
if [[ "$SAMPLES_PER_CLASS" -lt 1 ]]; then
  echo "--samples-per-class must be a positive integer" >&2
  exit 2
fi

LAB_DIR="$(mkdir -p "$LAB_DIR" && cd "$LAB_DIR" && pwd)"
if [[ -n "$MOCK_DIR_OVERRIDE" ]]; then
  MOCK_DIR="$(mkdir -p "$(dirname "$MOCK_DIR_OVERRIDE")" && cd "$(dirname "$MOCK_DIR_OVERRIDE")" && pwd)/$(basename "$MOCK_DIR_OVERRIDE")"
else
  MOCK_DIR="$LAB_DIR/mock"
fi
RESULT_DIR="$LAB_DIR/results"
BASE_ARGS=(--mock-dir "$MOCK_DIR")
if [[ "$RUN_CLIENT_TESTS" -eq 0 ]]; then
  BASE_ARGS+=(--skip-client-tests)
fi

echo "== materialize verified SQLite-backed kolmafia-mock =="
bash "$ROOT/compat/kolmafia-mock/materialize.sh" "${BASE_ARGS[@]}"

SQLITE_PATH="$MOCK_DIR/.kolmafia-mock-compat/dol.sqlite"
COMPAT_MANIFEST="$MOCK_DIR/.kolmafia-mock-compat/compat-manifest.json"
test -f "$SQLITE_PATH"
test -f "$COMPAT_MANIFEST"

echo "== overlay don_combo WaterSheep lab =="
mkdir -p "$MOCK_DIR/src/don-combo-lab"
cp "$ROOT/compat/don-combo-watersheep/scenario.ts" "$MOCK_DIR/src/don-combo-lab/scenario.ts"
cp "$ROOT/compat/don-combo-watersheep/scenario.test.ts" "$MOCK_DIR/src/don-combo-lab/scenario.test.ts"
cp "$ROOT/compat/don-combo-watersheep/bench.ts" "$MOCK_DIR/src/don-combo-lab/bench.ts"

node - "$MOCK_DIR/package.json" <<'NODE'
const fs = require("node:fs");
const packagePath = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
pkg.dependencies ??= {};
pkg.scripts ??= {};
pkg.dependencies["kol.js"] = "0.15.4";
pkg.scripts["test:don-combo-lab"] = "vitest run src/don-combo-lab/scenario.test.ts";
pkg.scripts["bench:don-combo"] = "tsx src/don-combo-lab/bench.ts";
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");
NODE

echo "== install disposable lab dependency =="
(
  cd "$MOCK_DIR"
  corepack enable >/dev/null 2>&1 || true
  yarn install --no-immutable
)

echo "== corpus + mock + contract smoke =="
(
  cd "$MOCK_DIR"
  export KOLMAFIA_MOCK_DOL_SQLITE="$SQLITE_PATH"
  yarn vitest run src/don-combo-lab/scenario.test.ts
)

BENCH_STATUS="not-run"
if [[ -n "$WATERSHEEP_URL" ]]; then
  echo "== WaterSheep deterministic benchmark =="
  BENCH_ARGS=(
    --sqlite "$SQLITE_PATH"
    --endpoint "$WATERSHEEP_URL"
    --out "$RESULT_DIR"
    --samples-per-class "$SAMPLES_PER_CLASS"
  )
  if [[ "$ORDER_CHECK" -eq 1 ]]; then
    BENCH_ARGS+=(--order-check)
  fi
  if [[ -n "$LIVE_RUNTIME" ]]; then
    BENCH_ARGS+=(--runtime "$LIVE_RUNTIME")
  fi
  (
    cd "$MOCK_DIR"
    export KOLMAFIA_MOCK_DOL_SQLITE="$SQLITE_PATH"
    yarn tsx src/don-combo-lab/bench.ts "${BENCH_ARGS[@]}"
  )
  BENCH_STATUS="pass"
fi

TOKENS_HEAD="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
MOCK_HEAD="$(git -C "$MOCK_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
SQLITE_SHA="$(sha256sum "$SQLITE_PATH" | awk '{print $1}')"
mkdir -p "$LAB_DIR"
cat > "$LAB_DIR/lab-manifest.json" <<EOF
{
  "schema": "don-combo-watersheep-lab-materialization/v1",
  "authority": "none",
  "evidence_contract": "don-combo-watersheep-evidence/v1",
  "tokens_repository": "https://github.com/donCannoli-burns/tokens-of-loathing",
  "tokens_commit": "$TOKENS_HEAD",
  "mock_repository": "https://github.com/loathers/kolmafia-mock",
  "mock_commit": "$MOCK_HEAD",
  "mock_compat_manifest": "$COMPAT_MANIFEST",
  "sqlite_path": "$SQLITE_PATH",
  "sqlite_sha256": "$SQLITE_SHA",
  "kol_js_version": "0.15.4",
  "watersheep_endpoint": "$WATERSHEEP_URL",
  "benchmark_status": "$BENCH_STATUS",
  "results_dir": "$RESULT_DIR"
}
EOF

echo
echo "DON_COMBO_WATERSHEEP_MATERIALIZED=PASS"
echo "lab_dir=$LAB_DIR"
echo "mock_dir=$MOCK_DIR"
echo "sqlite_sha256=$SQLITE_SHA"
echo "benchmark_status=$BENCH_STATUS"
