/**
 * The up-channel into GLOB-MOD (INV-7).
 *
 * INV-7 reads: "Every layer contributes to it as one competing parameter;
 * contributions blend, re-weighted each cycle, never last-write-wins." Until
 * this channel existed no layer could contribute at all — the sole caller of
 * glob.contribute in the whole implementation was the driver, once per cycle,
 * with one hard-coded key. With a single contributor every clause of that
 * sentence was empty: nothing competed, and one contribution blended IS the last
 * write.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { runLayer, type ContributeFn, type LayerSpec } from "./layer.js";
import { createCycle, type Layers } from "./cycle.js";
import { createGlobMod } from "./glob-mod.js";
import {
  ATTENTION_GAIN_PARAM,
  attentionGainFor,
  createT1, createT2, createT3, createT4, createT5, createT6, createT7, createT8,
} from "./layers/index.js";
import { createDataStore } from "../store/data-store.js";
import { createEventLog, type EventLog } from "../store/event-log.js";
import { admitHostData } from "../store/tagging-gate.js";
import type { ModField } from "./types.js";

const FIELD: ModField = { params: {}, t: 0 };
const datum = () =>
  admitHostData(
    { payload: 1, admittingLayer: 1, open: { domain: "d", a: "1", b: "2" } },
    0,
  );

/** A layer that contributes whatever it is told to. */
function contributor(index: 1 | 8, params: Record<string, number>, weight?: number) {
  return {
    index,
    consumes: [],
    process(_input: null, _field: ModField, _emit: unknown, contribute: ContributeFn) {
      contribute(params, weight);
      return null;
    },
  } as unknown as LayerSpec<null, null>;
}

// ── the channel itself ──

test("a contribution is bound to the layer that made it", () => {
  const run = runLayer(contributor(8, { g: 0.25 }), null, FIELD, datum());
  assert.deepEqual(run.contributions, [{ layer: 8, params: { g: 0.25 }, weight: 1 }]);
});

test("a declared weight is carried through", () => {
  const run = runLayer(contributor(8, { g: 1 }, 3), null, FIELD, datum());
  assert.equal(run.contributions[0]!.weight, 3);
});

test("a layer that declares fewer parameters still runs", () => {
  // Most layers want neither emit nor contribute and simply omit them.
  const plain = {
    index: 1,
    consumes: [],
    process: (_input: null) => null,
  } as unknown as LayerSpec<null, null>;
  const run = runLayer(plain, null, FIELD, datum());
  assert.deepEqual(run.contributions, []);
});

test("the layer never states its own index, exactly as with emit", () => {
  const lying = {
    index: 8,
    consumes: [],
    process(_input: null, _field: ModField, _emit: unknown, contribute: ContributeFn) {
      contribute({ g: 1 });
      return null;
    },
  } as unknown as LayerSpec<null, null>;
  assert.equal(runLayer(lying, null, FIELD, datum()).contributions[0]!.layer, 8);
});

// ── T8 sets the width of attention ──

test("attention narrows as the loop holds more Others", () => {
  assert.equal(attentionGainFor(1), 1);
  assert.equal(attentionGainFor(4), 0.25);
  assert.ok(attentionGainFor(10) < attentionGainFor(4), "more Others, thinner attention");
});

test("an empty or single-Other loop attends fully", () => {
  assert.equal(attentionGainFor(0), 1);
  assert.equal(attentionGainFor(1), 1);
});

// ── through the driver, into the field ──

function sig(entity: string, value: unknown) {
  return { source_id: "ch", raw_payload: { entity, value }, t: 1 };
}

function freshCycle() {
  const events: EventLog = createEventLog();
  const glob = createGlobMod({ appraisalGain: 1 }, 0);
  const layers: Layers = {
    t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
    t5: createT5(), t6: createT6(), t7: createT7(), t8: createT8(),
  };
  const cycle = createCycle({
    layers, glob, data: createDataStore(), events, initialEmission: { action: "boot" },
  });
  return { cycle, glob, events };
}

test("a layer's contribution reaches the field, and only at N+1 (INV-7)", () => {
  const { cycle, glob } = freshCycle();
  assert.equal(glob.current().params[ATTENTION_GAIN_PARAM], undefined, "not before the cycle");
  cycle.run({ signals: [sig("a", 1)], changes: [] });
  assert.equal(
    glob.current().params[ATTENTION_GAIN_PARAM],
    1,
    "one Other: full attention, in force from the next cycle",
  );
});

test("the field narrows as the loop meets more Others", () => {
  const { cycle, glob } = freshCycle();
  cycle.run({ signals: [sig("a", 1)], changes: [] });
  cycle.run({ signals: [sig("a", 1), sig("b", 1)], changes: [] });
  cycle.run({ signals: [sig("a", 1), sig("b", 1), sig("c", 1), sig("d", 1)], changes: [] });
  const gain = glob.current().params[ATTENTION_GAIN_PARAM]!;
  assert.ok(gain < 1, `attention narrowed to ${gain}`);
});

test("contributions blend rather than last-write-win", () => {
  // The clause that could not be exercised with one contributor. Two layers
  // name the same key with different values; the field takes the weighted
  // average, not whichever ran last.
  const glob = createGlobMod({}, 0);
  glob.contribute(1, { g: 0 }, 1);
  glob.contribute(8, { g: 1 }, 1);
  glob.advance(1);
  assert.equal(glob.current().params.g, 0.5);

  const weighted = createGlobMod({}, 0);
  weighted.contribute(1, { g: 0 }, 3);
  weighted.contribute(8, { g: 1 }, 1);
  weighted.advance(1);
  assert.equal(weighted.current().params.g, 0.25, "re-weighted, as INV-7 says");
});

test("the driver's own resistance contribution still lands alongside the layers'", () => {
  const { cycle, glob } = freshCycle();
  cycle.run({ signals: [sig("a", 1)], changes: [] });
  const params = glob.current().params;
  assert.ok("resistance" in params, "the driver's key");
  assert.ok(ATTENTION_GAIN_PARAM in params, "and a layer's");
});
