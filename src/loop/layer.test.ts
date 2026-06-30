/**
 * Smoke test — Stage 4c, the layer scaffold + meaning-channel.
 *
 * Fixed checks: a datum traverses the layers leaving a floor-tag (and a
 * layer_trace entry) at each; the scaffold halts on the three invariants it
 * wires — INV-3 (meaning-channel order), INV-4 (ref_frame ≠ null), INV-1
 * (closed-loop topology). No layer logic yet; stub specs stand in.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runLayer,
  validateLayerSpec,
  type LayerSpec,
} from "./layer.js";
import { createMeaningChannel } from "./meaning-channel.js";
import { canonicalLoopTopology, validateLoopTopology } from "./topology.js";
import type { InfoUnit, ModField, LayerIndex } from "./types.js";
import type { TaggedDatum } from "../store/tags.js";
import { admitHostData } from "../store/tagging-gate.js";
import { InvariantViolation } from "../invariants/violation.js";

const field: ModField = { params: {}, t: 0 };
const open = { domain: "test", format: "json", platform: "cli" };

/** A trivial identity layer at a given index (no real logic — 4c scaffold). */
function stubLayer(index: LayerIndex): LayerSpec<unknown, unknown> {
  return { index, consumes: [], process: (input) => input };
}

test("a datum traverses the layers, stamping a floor-tag and trace at each", () => {
  let datum: TaggedDatum = admitHostData({ payload: "x", admittingLayer: 1, open }, 0);
  for (let i = 1 as LayerIndex; i <= 8; i = (i + 1) as LayerIndex) {
    datum = runLayer(stubLayer(i), null, field, datum).datum;
  }
  // floor-tag tracks the last layer; the trace is the whole path
  assert.equal(datum.fixed.floorTag, 8);
  assert.deepEqual(datum.trace, [1, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test("runLayer runs pre → process → post in order", () => {
  const calls: string[] = [];
  const spec: LayerSpec<number, number> = {
    index: 1,
    consumes: [],
    pre: () => void calls.push("pre"),
    process: (n) => {
      calls.push("process");
      return n + 1;
    },
    post: () => void calls.push("post"),
  };
  const datum = admitHostData({ payload: 1, admittingLayer: 1, open }, 0);
  const run = runLayer(spec, 41, field, datum);
  assert.equal(run.output, 42);
  assert.deepEqual(calls, ["pre", "process", "post"]);
});

test("validateLayerSpec halts (INV-3) if a layer consumes a higher layer", () => {
  assert.throws(
    () => validateLayerSpec({ index: 3, consumes: [5] }),
    InvariantViolation,
  );
});

test("validateLayerSpec accepts consuming lower-or-equal layers", () => {
  assert.doesNotThrow(() => validateLayerSpec({ index: 5, consumes: [1, 3, 5] }));
});

test("runLayer halts (INV-4) if an emitted InfoUnit has a null ref_frame", () => {
  // A corrupted unit crossing the boundary — type-illegal, simulated for the
  // runtime guard (defense in depth).
  const badUnit = { content: 1, ref_frame: null, t: 1, layer_trace: [1] } as unknown as InfoUnit;
  const spec: LayerSpec<unknown, InfoUnit> = {
    index: 1,
    consumes: [],
    process: () => badUnit,
    infoUnits: (out) => [out],
  };
  const datum = admitHostData({ payload: 1, admittingLayer: 1, open }, 0);
  assert.throws(() => runLayer(spec, null, field, datum), InvariantViolation);
});

test("runLayer passes a well-formed InfoUnit (INV-4 satisfied)", () => {
  const goodUnit: InfoUnit = {
    content: 1,
    ref_frame: { boundLayer: 1, ref: "root" },
    t: 1,
    layer_trace: [1],
  };
  const spec: LayerSpec<unknown, InfoUnit> = {
    index: 1,
    consumes: [],
    process: () => goodUnit,
    infoUnits: (out) => [out],
  };
  const datum = admitHostData({ payload: 1, admittingLayer: 1, open }, 0);
  assert.doesNotThrow(() => runLayer(spec, null, field, datum));
});

test("meaning-channel halts (INV-3) reading a higher layer", () => {
  const ch = createMeaningChannel();
  ch.publish(5, "from-5");
  assert.throws(() => ch.read(3, 5), InvariantViolation);
});

test("meaning-channel reads a lower layer's published output", () => {
  const ch = createMeaningChannel();
  ch.publish(2, "from-2");
  assert.equal(ch.read(5, 2), "from-2");
});

test("the canonical topology is closed (INV-1)", () => {
  assert.doesNotThrow(() => validateLoopTopology(canonicalLoopTopology()));
});

test("a topology with a sink halts (INV-1, dead branch)", () => {
  assert.throws(
    () => validateLoopTopology([{ from: 1, to: 2 }, { from: 8, to: "SINK" }]),
    InvariantViolation,
  );
});
