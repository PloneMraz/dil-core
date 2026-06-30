/**
 * Smoke test — Stage 4d, layers T1 and T2 (protocol §6.3, §7).
 *
 * T1 confirms the activity-environment (root frame, no self/env line). T2 draws
 * the agency line across cycles: UNDECIDED until stable, then SELF_WRITTEN vs
 * ENV_PUSHED by matching emissions; state accrues (INV-5); once stable nothing
 * leaves UNDECIDED (INV-6 postcondition).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { runLayer, validateLayerSpec } from "../layer.js";
import { createT1 } from "./t1.js";
import { createT2, type T2Input } from "./t2.js";
import type { Signal, ModField, ActivityEnvironment } from "../types.js";
import { admitHostData } from "../../store/tagging-gate.js";

const field: ModField = { params: {}, t: 0 };
const open = { domain: "test", format: "json", platform: "cli" };
const datum = () => admitHostData({ payload: 1, admittingLayer: 1, open }, 0);

// ── T1 ─────────────────────────────────────────────────────────────────────

test("T1 confirms the activity-environment as the root reference frame", () => {
  const signals: Signal[] = [
    { source_id: "a", raw_payload: 1, t: 5 },
    { source_id: "b", raw_payload: 2, t: 9 },
  ];
  const run = runLayer(createT1(), signals, field, datum());
  const env = run.output;
  assert.equal(env.ref_frame.boundLayer, 1);
  assert.equal(env.ref_frame.ref, "activity-environment");
  assert.equal((env.content as { present: boolean }).present, true);
  assert.equal((env.content as { count: number }).count, 2);
  assert.equal(env.t, 9); // latest signal time
  assert.equal(run.datum.fixed.floorTag, 1); // stamped
});

test("T1 with no signals still yields the root frame, present=false", () => {
  const run = runLayer(createT1(), [], field, datum());
  assert.equal((run.output.content as { present: boolean }).present, false);
  assert.equal(run.output.ref_frame.ref, "activity-environment");
});

test("T1 consumes nothing (INV-3 valid)", () => {
  assert.doesNotThrow(() => validateLayerSpec(createT1()));
});

// ── T2 ─────────────────────────────────────────────────────────────────────

const env: ActivityEnvironment = {
  content: { present: true, count: 1, sources: ["x"] },
  ref_frame: { boundLayer: 1, ref: "activity-environment" },
  t: 1,
  layer_trace: [1],
};

function t2Input(action: unknown, changes: { id: string; value: unknown }[]): T2Input {
  return { env, emitted: { action }, changes };
}

test("T2 leaves agency UNDECIDED before stability is reached", () => {
  const t2 = createT2(); // stability threshold = 3
  const out1 = runLayer(t2, t2Input("move", [{ id: "c", value: "move" }]), field, datum());
  assert.equal(out1.output.tagged[0]!.agency, "UNDECIDED");
});

test("T2 crystallizes the agency line once stable: SELF_WRITTEN vs ENV_PUSHED", () => {
  const t2 = createT2();
  // run two warm-up cycles (still UNDECIDED), then the third is stable
  runLayer(t2, t2Input("move", []), field, datum());
  runLayer(t2, t2Input("move", []), field, datum());
  const out = runLayer(
    t2,
    t2Input("move", [
      { id: "self", value: "move" }, // matches a recent emission
      { id: "env", value: "rain" }, // no matching emission
    ]),
    field,
    datum(),
  );
  const byId = Object.fromEntries(out.output.tagged.map((t) => [t.change.id, t.agency]));
  assert.equal(byId.self, "SELF_WRITTEN");
  assert.equal(byId.env, "ENV_PUSHED");
});

test("T2 state accrues across cycles (INV-5): the stable phase persists", () => {
  const t2 = createT2();
  for (let i = 0; i < 3; i++) runLayer(t2, t2Input("a", []), field, datum());
  // a later cycle is still stable — the counter accrued, was not reloaded
  const out = runLayer(t2, t2Input("a", [{ id: "c", value: "b" }]), field, datum());
  assert.equal(out.output.tagged[0]!.agency, "ENV_PUSHED");
});

test("T2 matching window recognises a lagged self-effect as SELF_WRITTEN", () => {
  const t2 = createT2({ stabilityThreshold: 1, window: 8 });
  runLayer(t2, t2Input("alpha", []), field, datum()); // emit alpha
  runLayer(t2, t2Input("beta", []), field, datum()); // emit beta
  // a change matching the older 'alpha' still within the window
  const out = runLayer(t2, t2Input("gamma", [{ id: "c", value: "alpha" }]), field, datum());
  assert.equal(out.output.tagged[0]!.agency, "SELF_WRITTEN");
});

test("T2 consumes only T1 (INV-3 valid)", () => {
  assert.doesNotThrow(() => validateLayerSpec(createT2()));
});
