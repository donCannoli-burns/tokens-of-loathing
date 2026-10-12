import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import {
  EVIDENCE_CONTRACT,
  LABELS,
  brierScore,
  buildScenarios,
  buildWaterSheepPayload,
  decodeScoreMass,
  loadCorpus,
  topLabel,
  type Label,
  type Scenario,
} from "./scenario.js";

interface Args {
  sqlite: string;
  endpoint: string;
  out: string;
  samplesPerClass: number;
  orderCheck: boolean;
  runtime?: string;
}

interface CaseResult {
  id: string;
  truth: Label;
  top: Label;
  confidence: number;
  correct: boolean;
  brier: number;
  latency_ms: number;
  score_mass: Record<Label, number>;
  order_check?: {
    rotation: number;
    top: Label;
    confidence: number;
    flipped: boolean;
    latency_ms: number;
    score_mass: Record<Label, number>;
  };
}

function parseArgs(argv: string[]): Args {
  const values: Partial<Args> = {
    sqlite: process.env.KOLMAFIA_MOCK_DOL_SQLITE || ".kolmafia-mock-compat/dol.sqlite",
    endpoint: process.env.WATERSHEEP_URL || "http://127.0.0.1:8766/v1/systemone",
    out: process.env.DON_COMBO_LAB_OUT || ".kolmafia-mock-compat/don-combo-watersheep",
    samplesPerClass: 8,
    orderCheck: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === "--sqlite") values.sqlite = argv[++i];
    else if (value === "--endpoint") values.endpoint = argv[++i];
    else if (value === "--out") values.out = argv[++i];
    else if (value === "--samples-per-class") values.samplesPerClass = Number(argv[++i]);
    else if (value === "--runtime") values.runtime = argv[++i];
    else if (value === "--order-check") values.orderCheck = true;
    else throw new Error(`unknown argument: ${value}`);
  }
  if (!values.sqlite || !values.endpoint || !values.out) throw new Error("missing required lab argument");
  if (!Number.isInteger(values.samplesPerClass) || values.samplesPerClass! < 1) {
    throw new Error("--samples-per-class must be a positive integer");
  }
  return values as Args;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number, places = 6): number {
  const scale = Math.pow(10, places);
  return Math.round(value * scale) / scale;
}

async function sha256(path: string): Promise<string> {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

function gitHead(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function ask(
  endpoint: string,
  scenario: Scenario,
  rotation = 0,
): Promise<{ scores: Record<Label, number>; ms: number }> {
  const started = performance.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildWaterSheepPayload(scenario, rotation)),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`WaterSheep HTTP ${response.status}: ${text}`);
  const parsed = JSON.parse(text) as {
    answers?: { tile_class?: { probabilities?: Record<string, number> } };
    error?: string;
  };
  if (parsed.error) throw new Error(parsed.error);
  const probabilities = parsed.answers?.tile_class?.probabilities;
  if (!probabilities) throw new Error("WaterSheep response missing tile_class probabilities");
  return {
    scores: decodeScoreMass(probabilities, rotation),
    ms: performance.now() - started,
  };
}

function expectedCalibrationError(cases: CaseResult[], bins = 10): number {
  let total = 0;
  for (let bin = 0; bin < bins; bin++) {
    const low = bin / bins;
    const high = (bin + 1) / bins;
    const members = cases.filter((item) => {
      const inclusiveTop = bin === bins - 1;
      return item.confidence >= low && (inclusiveTop ? item.confidence <= high : item.confidence < high);
    });
    if (!members.length) continue;
    const confidence = mean(members.map((item) => item.confidence));
    const accuracy = mean(members.map((item) => (item.correct ? 1 : 0)));
    total += (members.length / cases.length) * Math.abs(accuracy - confidence);
  }
  return total;
}

async function verifyRuntimeContract(path?: string): Promise<Record<string, unknown> | null> {
  if (!path) return null;
  const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, any>;
  const runtimeContract = parsed?.watersheep?.evidence_contract;
  if (runtimeContract !== EVIDENCE_CONTRACT) {
    throw new Error(
      `runtime evidence contract mismatch: expected ${EVIDENCE_CONTRACT}, got ${String(runtimeContract)}`,
    );
  }
  return {
    path: resolve(path),
    schema: parsed.schema ?? null,
    generated_at: parsed.generated_at ?? null,
    receipt_state_sha256: parsed.receipt?.state_sha256 ?? null,
    evidence_contract: runtimeContract,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sqlite = resolve(args.sqlite);
  const out = resolve(args.out);
  const corpus = await loadCorpus(sqlite);
  const runtime = await verifyRuntimeContract(args.runtime);
  const scenarios = buildScenarios(args.samplesPerClass);

  const cases: CaseResult[] = [];
  for (const [index, scenario] of scenarios.entries()) {
    const base = await ask(args.endpoint, scenario, 0);
    const top = topLabel(base.scores);
    const result: CaseResult = {
      id: scenario.id,
      truth: scenario.ground_truth,
      top,
      confidence: base.scores[top],
      correct: top === scenario.ground_truth,
      brier: brierScore(base.scores, scenario.ground_truth),
      latency_ms: round(base.ms, 3),
      score_mass: base.scores,
    };
    if (args.orderCheck) {
      const rotated = await ask(args.endpoint, scenario, 1);
      const rotatedTop = topLabel(rotated.scores);
      result.order_check = {
        rotation: 1,
        top: rotatedTop,
        confidence: rotated.scores[rotatedTop],
        flipped: rotatedTop !== top,
        latency_ms: round(rotated.ms, 3),
        score_mass: rotated.scores,
      };
    }
    cases.push(result);
    process.stdout.write(
      `[${String(index + 1).padStart(3, "0")}/${scenarios.length}] ${scenario.id} truth=${scenario.ground_truth} top=${top} p=${result.confidence.toFixed(4)} ${result.correct ? "OK" : "MISS"}\n`,
    );
  }

  const perClass = Object.fromEntries(
    LABELS.map((label) => {
      const members = cases.filter((item) => item.truth === label);
      return [
        label,
        {
          cases: members.length,
          accuracy: round(mean(members.map((item) => (item.correct ? 1 : 0))), 4),
          mean_brier: round(mean(members.map((item) => item.brier)), 6),
          mean_confidence: round(mean(members.map((item) => item.confidence)), 6),
        },
      ];
    }),
  );
  const flips = cases.flatMap((item) => (item.order_check ? [item.order_check.flipped ? 1 : 0] : []));
  const mockManifestPath = resolve(".kolmafia-mock-compat/compat-manifest.json");
  let mockManifest: Record<string, unknown> | null = null;
  try {
    mockManifest = JSON.parse(await readFile(mockManifestPath, "utf8"));
  } catch {
    mockManifest = null;
  }

  const report = {
    schema: "don-combo-watersheep-lab/v1",
    generated_at: new Date().toISOString(),
    authority: "none",
    model_role: "advisory",
    evidence_contract: EVIDENCE_CONTRACT,
    source: {
      tokens_of_loathing_commit: gitHead(),
      sqlite_path: sqlite,
      sqlite_sha256: await sha256(sqlite),
      corpus_last_update: corpus.last_update,
      corpus_last_revision: corpus.last_revision,
      mock_manifest: mockManifest,
      kol_js_role: "pure normalization/test utility; no live KoL client used",
    },
    live_runtime_reference: runtime,
    model: {
      endpoint: args.endpoint,
      scenario_count: cases.length,
      samples_per_class: args.samplesPerClass,
      order_check: args.orderCheck,
    },
    metrics: {
      accuracy: round(mean(cases.map((item) => (item.correct ? 1 : 0))), 4),
      mean_brier: round(mean(cases.map((item) => item.brier)), 6),
      ece_10: round(expectedCalibrationError(cases, 10), 6),
      mean_latency_ms: round(mean(cases.map((item) => item.latency_ms)), 3),
      order_flip_rate: flips.length ? round(mean(flips), 4) : null,
      per_class: perClass,
    },
    corpus_items: corpus.items,
  };

  await mkdir(out, { recursive: true });
  const reportPath = resolve(out, "report.json");
  const casesPath = resolve(out, "cases.jsonl");
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  await writeFile(casesPath, cases.map((item) => JSON.stringify(item)).join("\n") + "\n");

  process.stdout.write("\nDON_COMBO_WATERSHEEP_LAB=PASS\n");
  process.stdout.write(`report=${reportPath}\n`);
  process.stdout.write(`cases=${casesPath}\n`);
  process.stdout.write(`accuracy=${report.metrics.accuracy}\n`);
  process.stdout.write(`mean_brier=${report.metrics.mean_brier}\n`);
  if (report.metrics.order_flip_rate != null) {
    process.stdout.write(`order_flip_rate=${report.metrics.order_flip_rate}\n`);
  }
  process.stdout.write(`sqlite=${basename(sqlite)}:${report.source.sqlite_sha256}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
