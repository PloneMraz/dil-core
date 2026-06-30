/**
 * Smoke test — Stage 4a, the shared types (protocol §6.1).
 *
 * The load-bearing check here is at the TYPE level: INV-4 is enforced by making
 * `InfoUnit.ref_frame` non-nullable, so a Signal (no frame) is not an InfoUnit.
 * The `@ts-expect-error` lines below FAIL the build (tsc) if those constructions
 * ever become legal — that is the test. A couple of runtime assertions confirm
 * the shapes are usable and reconcile with the inner rings.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  Signal,
  InfoUnit,
  ActivityEnvironment,
  RefFrame,
  PredErr,
} from "./types.js";
import type { ReferredUnit } from "../invariants/types.js";
import { assertReferred } from "../invariants/guards.js";

const frame: RefFrame = { boundLayer: 1, ref: "root" };

test("an InfoUnit carries a non-null ref_frame (INV-4 at type level)", () => {
  const info: InfoUnit = {
    content: "hello",
    ref_frame: frame,
    t: 1,
    layer_trace: [1],
  };
  assert.equal(info.ref_frame.ref, "root");

  // INV-4: a null ref_frame is not constructible — this MUST be a type error.
  // @ts-expect-error — ref_frame may not be null on an InfoUnit
  const bad: InfoUnit = { content: "x", ref_frame: null, t: 1, layer_trace: [1] };
  void bad;
});

test("a Signal has no ref_frame; it is not an InfoUnit", () => {
  const sig: Signal = { source_id: "s", raw_payload: 42, t: 1 };
  assert.equal(sig.raw_payload, 42);

  // A Signal lacks ref_frame/layer_trace, so it is not assignable to InfoUnit.
  // @ts-expect-error — a Signal is not an InfoUnit
  const notInfo: InfoUnit = sig;
  void notInfo;
});

test("ActivityEnvironment is an InfoUnit (the root reference frame)", () => {
  const env: ActivityEnvironment = {
    content: "present",
    ref_frame: frame,
    t: 1,
    layer_trace: [1],
  };
  assert.equal(env.ref_frame.boundLayer, 1);
});

test("an InfoUnit reconciles with the invariants' ReferredUnit guard", () => {
  const info: InfoUnit = {
    content: 1,
    ref_frame: frame,
    t: 1,
    layer_trace: [1],
  };
  // The runtime guard (defense in depth) accepts it; it has a non-null frame.
  const asReferred: ReferredUnit = info;
  assert.doesNotThrow(() => assertReferred(asReferred));
});

test("a PredErr registers absence as a null observed with a negative sign", () => {
  const info: InfoUnit = { content: 1, ref_frame: frame, t: 1, layer_trace: [1] };
  const absence: PredErr = {
    observed: null,
    predicted: info,
    delta: 1,
    signed: "-",
  };
  assert.equal(absence.observed, null);
  assert.equal(absence.signed, "-");
});
