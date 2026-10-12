import { describe, expect, test } from "vitest";
import { cleanString } from "kol.js";
import { Item as MockItem } from "../Item.js";

import {
  EVIDENCE_CONTRACT,
  LABELS,
  REQUIRED_ITEMS,
  buildScenarios,
  buildWaterSheepPayload,
  loadCorpus,
} from "./scenario.js";

const sqlite = process.env.KOLMAFIA_MOCK_DOL_SQLITE;
if (!sqlite) throw new Error("KOLMAFIA_MOCK_DOL_SQLITE is required for don_combo lab tests");

describe("don_combo WaterSheep lab", () => {
  test("frozen SQLite corpus and kolmafia-mock resolve the same beach-run items", async () => {
    const corpus = await loadCorpus(sqlite);
    expect(corpus.items).toHaveLength(REQUIRED_ITEMS.length);
    expect(corpus.last_revision).toBeTypeOf("number");
    expect((corpus.last_revision ?? 0) > 0).toBe(true);

    for (const item of corpus.items) {
      expect(cleanString(item.name)).toBe(item.name);
      expect(MockItem.get(item.name).id).toBe(item.id);
    }
  });

  test("scenario suite covers every class with stable typed evidence", () => {
    const scenarios = buildScenarios(8);
    expect(scenarios).toHaveLength(LABELS.length * 8);
    expect(new Set(scenarios.map((scenario) => scenario.ground_truth))).toEqual(new Set(LABELS));

    for (const scenario of scenarios) {
      expect(scenario.minute).toBeGreaterThanOrEqual(1);
      expect(scenario.minute).toBeLessThanOrEqual(10000);
      expect(scenario.evidence.layout_snapshots).toBeGreaterThan(0);
      expect(scenario.evidence.session_events).toBeGreaterThan(0);
      expect(scenario.evidence.observation_count).toBe(
        scenario.evidence.layout_snapshots + scenario.evidence.session_events,
      );
      for (const value of Object.values(scenario.evidence.observed_symbol_rates)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      for (const value of Object.values(scenario.evidence.observed_outcome_rates)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  test("WaterSheep projection carries the live contract but not benchmark truth", () => {
    for (const scenario of buildScenarios(2)) {
      const payload = buildWaterSheepPayload(scenario);
      expect(payload.state.evidence_contract).toBe(EVIDENCE_CONTRACT);
      const encoded = JSON.stringify(payload);
      expect(encoded).not.toContain("ground_truth");
      expect(encoded).not.toContain("is_combo_baseline");
      expect(encoded).not.toContain("candidate_source");
      expect(encoded).not.toContain("known_rare");
      expect(Object.keys(payload.questions.tile_class.criteria)).toEqual(["A", "B", "C", "D", "E", "F"]);
    }
  });
});
