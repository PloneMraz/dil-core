/**
 * Smoke test — Stage 4d, layers T6, T7, T8 (protocol §6.3, §8.4).
 *
 * T6 builds OtherModels whose independence evidence accrues only under Mode-B
 * (resistance) and degenerates under Mode-A. T7 registers absence as a signed-
 * negative PredErr. T8 builds RelValue (only when N≥2) and SocialEdge, and never
 * emits an identity (T8-INV / INV-2).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { runLayer, validateLayerSpec } from "../layer.js";
import { createT6, type IndependenceEvidence } from "./t6.js";
import { createT7 } from "./t7.js";
import { createT8 } from "./t8.js";
import type { ModField, InfoUnit, PredErr, OtherModel } from "../types.js";
import type { T5Result } from "./t5.js";
import { admitHostData } from "../../store/tagging-gate.js";

const field: ModField = { params: {}, t: 0 };
const open = { domain: "test", format: "json", platform: "cli" };
const datum = () => admitHostData({ payload: 1, admittingLayer: 1, open }, 0);

function unit(value: unknown): InfoUnit {
  return { content: { value }, ref_frame: { boundLayer: 5, ref: "x" }, t: 1, layer_trace: [5] };
}
function result(entity_id: string, delta: 0 | 1): T5Result {
  const predErr: PredErr = { observed: unit("v"), predicted: unit("v"), delta, signed: "+" };
  return {
    entity_id,
    expectation: { predicted: unit("v"), confidence: 1, built_from: [] },
    predErr,
  };
}

// ── T6 ─────────────────────────────────────────────────────────────────────

test("T6 accrues independence evidence under resistance (Mode-B)", () => {
  const t6 = createT6();
  runLayer(t6, { results: [result("e", 1)], envPushed: new Set(["e"]) }, field, datum());
  const out = runLayer(t6, { results: [result("e", 1)], envPushed: new Set(["e"]) }, field, datum());
  const ev = out.output.others[0]!.independence_evidence as IndependenceEvidence;
  assert.equal(ev.resistances, 2);
  assert.equal(ev.envPushed, 2);
});

test("T6 model degenerates under Mode-A (no resistance, no env-push)", () => {
  const t6 = createT6();
  const out = runLayer(t6, { results: [result("e", 0)] }, field, datum());
  const ev = out.output.others[0]!.independence_evidence as IndependenceEvidence;
  assert.equal(ev.resistances, 0);
  assert.equal(ev.envPushed, 0);
});

// ── T7 ─────────────────────────────────────────────────────────────────────

test("T7 registers an expected entity's absence as a negative PredErr", () => {
  const t7 = createT7();
  // cycle 1: 'e' is expected (seen) and observed → no absence
  const a = runLayer(
    t7,
    { expectations: [{ entity_id: "e", predicted: unit("v") }], observed: new Set(["e"]) },
    field,
    datum(),
  );
  assert.equal(a.output.absences.length, 0);
  // cycle 2: 'e' expected but does NOT return → absence
  const b = runLayer(
    t7,
    { expectations: [], observed: new Set<string>() },
    field,
    datum(),
  );
  assert.equal(b.output.absences.length, 1);
  assert.equal(b.output.absences[0]!.observed, null);
  assert.equal(b.output.absences[0]!.signed, "-");
});

test("T7 registers no absence for an entity that did return", () => {
  const t7 = createT7();
  const out = runLayer(
    t7,
    { expectations: [{ entity_id: "e", predicted: unit("v") }], observed: new Set(["e"]) },
    field,
    datum(),
  );
  assert.equal(out.output.absences.length, 0);
});

// ── T8 ─────────────────────────────────────────────────────────────────────

function other(entity_id: string, resistances: number): OtherModel {
  return {
    entity_id,
    context_map: {},
    independence_evidence: { resistances, envPushed: 0 },
  };
}

test("T8 builds no RelValue when N < 2", () => {
  const out = runLayer(createT8(), { others: [other("a", 3)] }, field, datum());
  assert.equal(out.output.relValues.length, 0);
});

test("T8 ranks entities by resistance when N ≥ 2 (RelValue)", () => {
  const out = runLayer(
    createT8(),
    { others: [other("a", 1), other("b", 5), other("c", 3)] },
    field,
    datum(),
  );
  const ranking = out.output.relValues.map((r) => r.entity_id);
  assert.deepEqual(ranking, ["b", "c", "a"]); // by descending resistance
  assert.equal(out.output.relValues[0]!.relative_rank, 1);
  assert.equal(out.output.relValues[0]!.comparison_basis, "resistance");
});

test("T8 passes through Other↔Other social edges", () => {
  const out = runLayer(
    createT8(),
    {
      others: [other("a", 1), other("b", 2)],
      interactions: [{ a_id: "a", b_id: "b", observed_interaction: "trade" }],
    },
    field,
    datum(),
  );
  assert.equal(out.output.socialEdges.length, 1);
  assert.equal(out.output.socialEdges[0]!.observed_interaction, "trade");
});

test("T6, T7, T8 declare valid meaning-channel dependencies (INV-3)", () => {
  assert.doesNotThrow(() => validateLayerSpec(createT6()));
  assert.doesNotThrow(() => validateLayerSpec(createT7()));
  assert.doesNotThrow(() => validateLayerSpec(createT8()));
});
