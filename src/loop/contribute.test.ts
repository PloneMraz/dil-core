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
  createT1, createT2, createT3, createT4, createT5, createT6, createT7, createT8,
} from "./layers/index.js";
import { ALERTNESS, AXES, EXPLORATION, TRUST } from "./field.js";
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

test("the layers' votes reach the field, and only at N+1 (INV-7)", () => {
  const { cycle, glob } = freshCycle();
  assert.deepEqual(glob.current().params, { appraisalGain: 1 }, "not before the cycle");
  cycle.run({ signals: [sig("a", 1)], changes: [] });

  const params = glob.current().params;
  for (const key of [TRUST, ALERTNESS, EXPLORATION]) {
    assert.ok(key in params, `${key} reached the field`);
  }
  assert.equal(params[TRUST], 1, "T1 heard the region, T4 bound what arrived");
  assert.equal(params[EXPLORATION], 1, "the one Other was met for the first time");
});

test("the field carries dispositions, never what was read (DIL-en-v7 §2)", () => {
  // "It carries how to read, never what is read." A count of Others or of
  // signals is what was read; only the axes, and what the host seeded, may be
  // in the field — and every axis is read by some operation (field.test.ts).
  const { cycle, glob } = freshCycle();
  cycle.run({ signals: [sig("a", 1)], changes: [] });
  cycle.run({ signals: [sig("a", 2), sig("b", 1)], changes: [] });
  cycle.run({ signals: [], changes: [] });
  const keys = Object.keys(glob.current().params).sort();
  const allowed = new Set<string>([...AXES, "appraisalGain"]);
  assert.deepEqual(keys.filter((k) => !allowed.has(k)), [], `unexpected keys: ${keys}`);
});

test("every axis stays within [0, 1] however the loop runs (no runaway)", () => {
  const { cycle, glob } = freshCycle();
  for (let i = 0; i < 12; i++) {
    const signals = i % 3 === 2 ? [] : [sig(`e${i % 4}`, i), sig("x", i % 2)];
    cycle.run({ signals, changes: [] });
    for (const name of AXES) {
      const v = glob.current().params[name];
      if (v === undefined) continue;
      assert.ok(v >= 0 && v <= 1, `${name} = ${v} at cycle ${i}`);
    }
  }
});

test("a layer that saw nothing on an axis leaves it as it was", () => {
  // No signals: T1 votes trust 0, but T4 had nothing to bind and T5 nothing to
  // expect — they cast no vote, and the axes they feed carry over.
  const { cycle, glob } = freshCycle();
  cycle.run({ signals: [sig("a", 1)], changes: [] });
  const before = glob.current().params[EXPLORATION];
  cycle.run({ signals: [], changes: [] });
  assert.equal(glob.current().params[EXPLORATION], before, "nothing met, nothing to explore on");
  assert.equal(glob.current().params[TRUST], 0, "T1 alone voted: the region said nothing");
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

test("the driver adds nothing of its own: it is not a layer", () => {
  const { cycle, glob } = freshCycle();
  cycle.run({ signals: [sig("a", 1)], changes: [] });
  assert.ok(!("resistance" in glob.current().params), "the driver's old key is gone");
});


// ── T8 closes back into the loop (INV-1) ──

test("T8's output re-enters the loop through the dispositions below it read", () => {
  // §6.2: "T8 closes back into the loop, not into a sink". The meaning-channel
  // cannot carry relValues or socialEdges down (INV-3); the field can, and T8
  // votes on trust — which T4 and T6 read — and on exploration.
  const t8 = createT8();
  const other = (id: string, resistances: number) => ({
    entity_id: id,
    context_map: {},
    independence_evidence: { resistances, envPushed: 0 },
  });
  const run = runLayer(
    t8,
    {
      others: [other("a", 3), other("b", 1)],
      interactions: [{ a_id: "a", b_id: "b", observed_interaction: "met" }],
    },
    FIELD,
    datum(),
  );
  const votes = run.contributions[0]!.params;
  assert.equal(votes[TRUST], 0.25, "resistance held 3:1 — one Other stands out");
  assert.equal(votes[EXPLORATION], 0.5, "one interaction between two Others");
});

test("with one Other, T8 has nothing to compare and casts no vote", () => {
  const run = runLayer(
    createT8(),
    { others: [{ entity_id: "a", context_map: {}, independence_evidence: { resistances: 1, envPushed: 0 } }] },
    FIELD,
    datum(),
  );
  assert.deepEqual(run.contributions, []);
});
