/**
 * Smoke test — Stage 4d, layers T3, T4, T5 (protocol §6.3).
 *
 * T3 ingests channels with content-typing; T4 binds to entity_id or STRANGER;
 * T5 builds expectations and emits signed PredErr, where resistance becomes
 * information — and PredErr falls with repetition against a stable entity (C2).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { runLayer, validateLayerSpec } from "../layer.js";
import { createT3 } from "./t3.js";
import { createT4, STRANGER, type BoundInfo } from "./t4.js";
import { createT5 } from "./t5.js";
import type { Signal, ModField, InfoUnit } from "../types.js";
import { admitHostData } from "../../store/tagging-gate.js";

const field: ModField = { params: {}, t: 0 };
const open = { domain: "test", format: "json", platform: "cli" };
const datum = () => admitHostData({ payload: 1, admittingLayer: 1, open }, 0);

function infoUnit(value: unknown, t = 1): InfoUnit {
  return { content: { value }, ref_frame: { boundLayer: 3, ref: "x" }, t, layer_trace: [3] };
}

// ── T3 ─────────────────────────────────────────────────────────────────────

test("T3 transduces signals, keeping info-type and physical channel distinct", () => {
  const signals: Signal[] = [{ source_id: "sensor", raw_payload: 42, t: 1 }];
  const out = runLayer(createT3(), { signals }, field, datum());
  const u = out.output.units[0]!;
  const c = u.content as { infoType: string; channel: string; value: unknown };
  assert.equal(c.channel, "sensor"); // physical channel preserved
  assert.equal(c.infoType, "raw"); // info-type preserved
  assert.equal(c.value, 42);
  assert.equal(u.ref_frame.boundLayer, 3);
});

test("T3 uses a per-channel transducer when registered", () => {
  const t3 = createT3({
    temp: (s) => ({ infoType: "celsius", value: Number(s.raw_payload) }),
  });
  const out = runLayer(t3, { signals: [{ source_id: "temp", raw_payload: "30", t: 1 }] }, field, datum());
  const c = out.output.units[0]!.content as { infoType: string; value: unknown };
  assert.equal(c.infoType, "celsius");
  assert.equal(c.value, 30);
});

// ── T4 ─────────────────────────────────────────────────────────────────────

test("T4 binds a known entity, and STRANGER otherwise", () => {
  const known: InfoUnit = infoUnit({ entity: "alice", note: "hi" });
  const unknown: InfoUnit = infoUnit({ note: "anon" });
  const out = runLayer(createT4(), { units: [known, unknown] }, field, datum());
  assert.equal(out.output.bound[0]!.entity_id, "alice");
  assert.equal(out.output.bound[1]!.entity_id, STRANGER);
});

// ── T5 ─────────────────────────────────────────────────────────────────────

function boundOf(value: unknown, entity = "e1"): BoundInfo {
  return { unit: infoUnit(value), entity_id: entity };
}

test("T5 emits a PredErr and an Expectation per observation", () => {
  const out = runLayer(createT5(), { bound: [boundOf("sun")] }, field, datum());
  const r = out.output.results[0]!;
  assert.equal(r.entity_id, "e1");
  assert.ok("delta" in r.predErr);
  assert.ok("confidence" in r.expectation);
});

test("PredErr falls to zero with repetition against a stable entity (C2)", () => {
  const t5 = createT5();
  // first observation: fresh, predicts itself → delta 0
  const a = runLayer(t5, { bound: [boundOf("sun")] }, field, datum());
  assert.equal(a.output.results[0]!.predErr.delta, 0);
  // a differing return → positive surprise
  const b = runLayer(t5, { bound: [boundOf("rain")] }, field, datum());
  assert.equal(b.output.results[0]!.predErr.delta, 1);
  assert.equal(b.output.results[0]!.predErr.signed, "+");
  // then the same value recurs → prediction matches → error back to zero
  const c = runLayer(t5, { bound: [boundOf("rain")] }, field, datum());
  assert.equal(c.output.results[0]!.predErr.delta, 0);
});

test("T5 confidence ramps over recurrence (accrual, INV-5)", () => {
  const t5 = createT5({ sufficientRecurrence: 3 });
  const c1 = runLayer(t5, { bound: [boundOf("x")] }, field, datum()).output.results[0]!;
  runLayer(t5, { bound: [boundOf("x")] }, field, datum());
  runLayer(t5, { bound: [boundOf("x")] }, field, datum());
  const c4 = runLayer(t5, { bound: [boundOf("x")] }, field, datum()).output.results[0]!;
  assert.ok(c1.expectation.confidence < c4.expectation.confidence);
  assert.equal(c4.expectation.confidence, 1); // reached full confidence
});

test("T5 tracks entities independently", () => {
  const t5 = createT5();
  runLayer(t5, { bound: [boundOf("sun", "a")] }, field, datum());
  const out = runLayer(
    t5,
    { bound: [boundOf("sun", "a"), boundOf("first", "b")] },
    field,
    datum(),
  );
  const byId = Object.fromEntries(out.output.results.map((r) => [r.entity_id, r.predErr.delta]));
  assert.equal(byId.a, 0); // 'a' matched its prior 'sun'
  assert.equal(byId.b, 0); // 'b' is fresh → predicts itself
});

test("T3, T4, T5 declare valid meaning-channel dependencies (INV-3)", () => {
  assert.doesNotThrow(() => validateLayerSpec(createT3()));
  assert.doesNotThrow(() => validateLayerSpec(createT4()));
  assert.doesNotThrow(() => validateLayerSpec(createT5()));
});
