import { cleanString } from "kol.js";
import { createClient, Item, Meta } from "data-of-loathing";

export const EVIDENCE_CONTRACT = "don-combo-watersheep-evidence/v1" as const;
export const LABELS = ["rare", "whale", "sandcastle", "twinkle", "regular", "scratched"] as const;
export type Label = (typeof LABELS)[number];

export const MODEL_KEYS = ["A", "B", "C", "D", "E", "F"] as const;
export type ModelKey = (typeof MODEL_KEYS)[number];

const CRITERIA: Record<Label, string> = {
  rare: "rare tile opportunity",
  whale: "whale opportunity",
  sandcastle: "sandcastle opportunity",
  twinkle: "twinkle or uncommon opportunity",
  regular: "ordinary regular beach opportunity",
  scratched: "already exhausted, combed, or low-value opportunity",
};

export interface CandidateEvidence {
  minute_fraction: number;
  hilbert_bucket_256: number;
  distance_from_current: number | null;
  layout_snapshots: number;
  session_events: number;
  observation_count: number;
  last_seen_age_hours: number | null;
  observed_symbol_rates: Record<"whale" | "twinkle" | "rough" | "combed" | "other", number>;
  observed_outcome_rates: Record<
    | "whale"
    | "rare_target"
    | "false_rare_rough"
    | "twinkle_fallback"
    | "rough_fallback"
    | "exhausted_fallback"
    | "unknown",
    number
  >;
  sand_per_event: number;
}

export interface Scenario {
  id: string;
  ground_truth: Label;
  minute: number;
  evidence: CandidateEvidence;
}

export interface CorpusItem {
  id: number;
  name: string;
  autosell: number;
  tradeable: boolean;
}

export interface CorpusSnapshot {
  sqlite_path: string;
  last_update: string | null;
  last_revision: number | null;
  items: CorpusItem[];
}

export const REQUIRED_ITEMS = [
  "grain of sand",
  "seal tooth",
  "taco shell",
  "coconut shell",
  "cyan seashell",
  "gray seashell",
  "green seashell",
  "yellow seashell",
  "magenta seashell",
  "driftwood hat",
  "driftwood pants",
  "driftwood bracelet",
  "kelp",
  "sea carrot",
  "sea avocado",
  "bunch of sea grapes",
] as const;

export async function loadCorpus(sqlitePath: string): Promise<CorpusSnapshot> {
  const client = createClient({ strategy: "local", path: sqlitePath });
  await client.load();
  const meta = await client.query.findOne(Meta, { id: 1 });
  const items: CorpusItem[] = [];
  for (const rawName of REQUIRED_ITEMS) {
    const name = cleanString(rawName).trim();
    const item = await client.query.findOne(Item, { name });
    if (!item) throw new Error(`missing corpus item: ${name}`);
    items.push({
      id: item.id,
      name: item.name,
      autosell: item.autosell,
      tradeable: item.tradeable,
    });
  }
  return {
    sqlite_path: sqlitePath,
    last_update: meta?.lastUpdate ? meta.lastUpdate.toISOString() : null,
    last_revision: meta?.lastRevision ?? null,
    items,
  };
}

function clampRate(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1_000_000) / 1_000_000));
}

function template(label: Label): {
  symbols: CandidateEvidence["observed_symbol_rates"];
  outcomes: CandidateEvidence["observed_outcome_rates"];
  sand: number;
  layouts: number;
  events: number;
} {
  const baseOutcomes: CandidateEvidence["observed_outcome_rates"] = {
    whale: 0,
    rare_target: 0,
    false_rare_rough: 0,
    twinkle_fallback: 0,
    rough_fallback: 0,
    exhausted_fallback: 0,
    unknown: 0,
  };
  const baseSymbols: CandidateEvidence["observed_symbol_rates"] = {
    whale: 0,
    twinkle: 0,
    rough: 0.2,
    combed: 0.1,
    other: 0.7,
  };
  switch (label) {
    case "rare":
      return {
        symbols: { ...baseSymbols, rough: 0.08, combed: 0.04, other: 0.88 },
        outcomes: { ...baseOutcomes, rare_target: 0.72, rough_fallback: 0.08, unknown: 0.2 },
        sand: 2.2,
        layouts: 5,
        events: 6,
      };
    case "whale":
      return {
        symbols: { ...baseSymbols, whale: 0.48, rough: 0.08, combed: 0.02, other: 0.42 },
        outcomes: { ...baseOutcomes, whale: 0.7, unknown: 0.3 },
        sand: 1.4,
        layouts: 4,
        events: 5,
      };
    case "sandcastle":
      return {
        symbols: { ...baseSymbols, rough: 0.1, combed: 0.04, other: 0.86 },
        outcomes: { ...baseOutcomes, rough_fallback: 0.12, unknown: 0.88 },
        sand: 9.5,
        layouts: 6,
        events: 7,
      };
    case "twinkle":
      return {
        symbols: { ...baseSymbols, twinkle: 0.52, rough: 0.08, combed: 0.04, other: 0.36 },
        outcomes: { ...baseOutcomes, twinkle_fallback: 0.68, unknown: 0.32 },
        sand: 2.7,
        layouts: 5,
        events: 6,
      };
    case "regular":
      return {
        symbols: { ...baseSymbols, rough: 0.58, combed: 0.08, other: 0.34 },
        outcomes: { ...baseOutcomes, rough_fallback: 0.62, unknown: 0.38 },
        sand: 3.1,
        layouts: 5,
        events: 6,
      };
    case "scratched":
      return {
        symbols: { ...baseSymbols, rough: 0.06, combed: 0.82, other: 0.12 },
        outcomes: { ...baseOutcomes, exhausted_fallback: 0.74, unknown: 0.26 },
        sand: 0.8,
        layouts: 7,
        events: 8,
      };
  }
}

export function buildScenarios(samplesPerClass = 8): Scenario[] {
  const scenarios: Scenario[] = [];
  LABELS.forEach((label, labelIndex) => {
    const base = template(label);
    for (let sample = 0; sample < samplesPerClass; sample++) {
      const minute = 1 + ((labelIndex * 1619 + sample * 173 + 41) % 10000);
      const jitter = ((sample % 5) - 2) * 0.01;
      const symbols = Object.fromEntries(
        Object.entries(base.symbols).map(([key, value]) => [key, clampRate(value + jitter)]),
      ) as CandidateEvidence["observed_symbol_rates"];
      const outcomes = Object.fromEntries(
        Object.entries(base.outcomes).map(([key, value]) => [
          key,
          value > 0 ? clampRate(value + jitter / 2) : 0,
        ]),
      ) as CandidateEvidence["observed_outcome_rates"];
      const layouts = base.layouts + (sample % 3);
      const events = base.events + (sample % 4);
      const d = (minute - 1) * 100;
      scenarios.push({
        id: `${label}-${String(sample + 1).padStart(2, "0")}`,
        ground_truth: label,
        minute,
        evidence: {
          minute_fraction: Math.round(((minute - 1) / 9999) * 1_000_000) / 1_000_000,
          hilbert_bucket_256: Math.floor(d / 4096),
          distance_from_current: Math.abs(minute - 5000),
          layout_snapshots: layouts,
          session_events: events,
          observation_count: layouts + events,
          last_seen_age_hours: Math.round((sample * 0.75 + 0.25) * 1000) / 1000,
          observed_symbol_rates: symbols,
          observed_outcome_rates: outcomes,
          sand_per_event: Math.round((base.sand + jitter * 5) * 10000) / 10000,
        },
      });
    }
  });
  return scenarios;
}

function semanticLabelForKey(keyIndex: number, rotation: number): Label {
  const normalized = ((keyIndex + rotation) % LABELS.length + LABELS.length) % LABELS.length;
  return LABELS[normalized];
}

export function buildWaterSheepPayload(scenario: Scenario, rotation = 0) {
  const criteria: Record<string, string> = {};
  MODEL_KEYS.forEach((key, index) => {
    const label = semanticLabelForKey(index, rotation);
    criteria[key] = CRITERIA[label];
  });
  return {
    state: {
      mode: "shadow-only; no action authorized",
      evidence_contract: EVIDENCE_CONTRACT,
      beach_minute: scenario.minute,
      minute_fraction: scenario.evidence.minute_fraction,
      hilbert_bucket_256: scenario.evidence.hilbert_bucket_256,
      distance_from_current: scenario.evidence.distance_from_current,
      layout_snapshots: scenario.evidence.layout_snapshots,
      session_events: scenario.evidence.session_events,
      last_seen_age_hours: scenario.evidence.last_seen_age_hours,
      observed_symbol_rates: scenario.evidence.observed_symbol_rates,
      observed_outcome_rates: scenario.evidence.observed_outcome_rates,
      sand_per_event: scenario.evidence.sand_per_event,
      current_layout_if_same_front: "not observed",
      withheld:
        "known rare annotations, Combo target/order, candidate source labels, baseline membership, and rare count are intentionally withheld",
    },
    questions: {
      tile_class: {
        type: "choice",
        instructions:
          "Experimental shadow scoring only. Assign relative score mass to six neutral outcome classes from the supplied weak evidence. Do not choose an action. The class keys are intentionally neutral.",
        criteria,
      },
    },
  };
}

export function decodeScoreMass(
  probabilities: Record<string, number>,
  rotation = 0,
): Record<Label, number> {
  const scores = Object.fromEntries(LABELS.map((label) => [label, 0])) as Record<Label, number>;
  MODEL_KEYS.forEach((key, index) => {
    const label = semanticLabelForKey(index, rotation);
    scores[label] = Number(probabilities[key] ?? probabilities[label] ?? 0);
  });
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) throw new Error("WaterSheep returned no score mass");
  LABELS.forEach((label) => {
    scores[label] /= total;
  });
  return scores;
}

export function topLabel(scores: Record<Label, number>): Label {
  return LABELS.reduce((best, label) => (scores[label] > scores[best] ? label : best), LABELS[0]);
}

export function brierScore(scores: Record<Label, number>, truth: Label): number {
  return (
    LABELS.reduce((sum, label) => {
      const expected = label === truth ? 1 : 0;
      return sum + Math.pow(scores[label] - expected, 2);
    }, 0) / LABELS.length
  );
}
