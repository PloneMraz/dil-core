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
  CHANNEL_ACTIVITY,
  INTERACTIONS,
  RESISTANCE_CONCENTRATION,
  OTHER_COUNT,
  STRANGENESS,
  SURPRISE,
  SILENCE,
  attentionWidth,
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

// ── attention is a COMPOSITION of what the field holds ──

test("attention narrows as the loop holds more Others", () => {
  assert.equal(attentionWidth({ [OTHER_COUNT]: 1 }), 1);
  assert.equal(attentionWidth({ [OTHER_COUNT]: 4 }), 0.25);
  assert.ok(
    attentionWidth({ [OTHER_COUNT]: 10 }) < attentionWidth({ [OTHER_COUNT]: 4 }),
    "more Others, thinner attention",
  );
});

test("attention widens again when what arrives stops being attributable", () => {
  // A strange situation earns a longer look; a crowded familiar one does not.
  const familiar = attentionWidth({ [OTHER_COUNT]: 4, [STRANGENESS]: 0 });
  const strange = attentionWidth({ [OTHER_COUNT]: 4, [STRANGENESS]: 1 });
  assert.ok(strange > familiar, `${strange} > ${familiar}`);
});

test("an empty field composes to 1, so a silent host is unchanged", () => {
  assert.equal(attentionWidth({}), 1);
});

test("no single layer decides the width", () => {
  // The mistake this replaces: T6 computed 1/N and contributed the ANSWER,
  // making attention one layer's constant. Now every layer reports a FACT from
  // its own vantage and the width is read off the composition.
  assert.notEqual(
    attentionWidth({ [OTHER_COUNT]: 4 }),
    attentionWidth({ [OTHER_COUNT]: 4, [STRANGENESS]: 0.5 }),
    "a second layer's fact changes the width",
  );
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

test("every layer's fact reaches the field, and only at N+1 (INV-7)", () => {
  const { cycle, glob } = freshCycle();
  assert.deepEqual(glob.current().params, { appraisalGain: 1 }, "not before the cycle");
  cycle.run({ signals: [sig("a", 1)], changes: [] });

  const params = glob.current().params;
  for (const key of [CHANNEL_ACTIVITY, STRANGENESS, SURPRISE, OTHER_COUNT, SILENCE]) {
    assert.ok(key in params, `${key} reached the field`);
  }
  assert.equal(params[OTHER_COUNT], 1, "one Other held");
  assert.equal(params[CHANNEL_ACTIVITY], 1, "one signal delivered");
});

test("the field narrows as the loop meets more Others", () => {
  const { cycle, glob } = freshCycle();
  cycle.run({ signals: [sig("a", 1)], changes: [] });
  cycle.run({ signals: [sig("a", 1), sig("b", 1)], changes: [] });
  cycle.run({ signals: [sig("a", 1), sig("b", 1), sig("c", 1), sig("d", 1)], changes: [] });
  assert.equal(glob.current().params[OTHER_COUNT], 4);
  assert.equal(attentionWidth(glob.current().params), 0.25);
});

test("the count is ACCRUED Others, not this cycle's returns", () => {
  // The bug this pins. The job sat on T8 first, which ranks the Others PRESENT
  // this cycle — so in a host where one entity returns per cycle T8 saw N = 1
  // every time and the width never moved. Measured on a live run: the gain sat
  // at 1.0 for all 80 cycles. T6 is the layer that ACCRUES Others, so it is the
  // one that knows how many the loop is holding.
  const { cycle, glob } = freshCycle();
  // Four entities, but only ever one returning per cycle.
  for (const id of ["a", "b", "c", "d"]) {
    cycle.run({ signals: [sig(id, 1)], changes: [] });
  }
  assert.equal(
    glob.current().params[OTHER_COUNT],
    4,
    "four Others held, though only one returned in any cycle",
  );
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
  assert.ok(OTHER_COUNT in params, "and a layer's");
});


// ── T8 closes back into the loop (INV-1) ──

test("T8's output re-enters the loop through the field, not into a sink", () => {
  // §6.2: "T8 closes back into the loop, not into a sink". Nothing read T8's
  // relValues or socialEdges; the field is the one path back that INV-3 allows.
  const { cycle, glob } = freshCycle();
  cycle.run({ signals: [sig("a", 1), sig("b", 1)], changes: [] });
  const params = glob.current().params;
  assert.ok(INTERACTIONS in params, "T8 reported the interactions it saw");
  assert.ok(RESISTANCE_CONCENTRATION in params, "and the relative picture");
});

test("interactions reported are the Other-to-Other ones the host supplied", () => {
  const { cycle, glob } = freshCycle();
  cycle.run({
    signals: [sig("a", 1), sig("b", 1)],
    changes: [],
    interactions: [{ a_id: "a", b_id: "b", observed_interaction: "contact-made" }],
  });
  assert.equal(glob.current().params[INTERACTIONS], 1);
});

test("with nothing resisting yet, concentration is 0 rather than undefined", () => {
  const { cycle, glob } = freshCycle();
  cycle.run({ signals: [sig("a", 1)], changes: [] });
  assert.equal(glob.current().params[RESISTANCE_CONCENTRATION], 0);
});
