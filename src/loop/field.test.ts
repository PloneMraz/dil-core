/**
 * The field reaches every layer (INV-7): "each layer receives it as background…
 * it modulates how each layer interprets input" — "same data + different field →
 * different meaning". Each test here gives one layer the same input under two
 * fields and shows the reading differ, and shows NEUTRAL reads as the reference
 * did. Which axis each layer reads is declared in decisions.ts FIELD_WIRING.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { runLayer } from "./layer.js";
import { createCycle, type Layers } from "./cycle.js";
import { createGlobMod } from "./glob-mod.js";
import { appraise } from "./appraisal.js";
import {
  createT1, createT2, createT3, createT4, createT5, createT6, createT7, createT8, graceOf,
  STRANGER,
} from "./layers/index.js";
import { ALERTNESS, EXPLORATION, NEUTRAL, TRUST, axis, rising, falling, shiftedCount, votes } from "./field.js";
import { createDataStore } from "../store/data-store.js";
import { createEventLog } from "../store/event-log.js";
import { admitHostData } from "../store/tagging-gate.js";
import { APPRAISAL_ANCHOR_ID } from "./decisions.js";
import type { InfoUnit, ModField, OtherModel, Signal } from "./types.js";

const field = (params: Record<string, number>): ModField => ({ params, t: 0 });
const EMPTY = field({});
const datum = () =>
  admitHostData({ payload: 1, admittingLayer: 1, open: { domain: "d", a: "1", b: "2" } }, 0);
const unit = (entity: string, value: unknown): InfoUnit => ({
  content: { infoType: "raw", channel: "ch", value: { entity, value } },
  ref_frame: { boundLayer: 3, ref: "channel:ch" },
  t: 1,
});

// ── the reading law ──

test("an axis the field does not carry reads NEUTRAL, and NEUTRAL shifts nothing", () => {
  assert.equal(axis(EMPTY, TRUST), NEUTRAL);
  assert.equal(rising(NEUTRAL), 1);
  assert.equal(falling(NEUTRAL), 1);
  assert.equal(shiftedCount(8, rising(NEUTRAL)), 8);
});

test("the field modulates and never annuls: no gain is 0 at either end", () => {
  // DIL-en-v7 §2: a field that determined a layer's reading would be a halted
  // loop, not a worse one.
  for (const v of [0, 1]) {
    assert.ok(rising(v) >= 0.5 && falling(v) >= 0.5, `v = ${v}`);
  }
});

test("an axis is read within [0, 1] whatever the field holds", () => {
  assert.equal(axis(field({ trust: 7 }), TRUST), 1);
  assert.equal(axis(field({ trust: -1 }), TRUST), 0);
});

test("a vote outside [0, 1] is refused, not clamped", () => {
  assert.throws(() => votes({ [TRUST]: 1.5 }), RangeError);
});

// ── T1: trust holds the environment through silence ──

test("T1: under trust, a short silence does not un-confirm the environment", () => {
  const read = (f: ModField) => {
    const t1 = createT1();
    runLayer(t1, [{ source_id: "ch", raw_payload: 1, t: 1 }] as Signal[], f, datum());
    return (runLayer(t1, [], f, datum()).output.content as { present: boolean }).present;
  };
  assert.equal(read(EMPTY), false, "NEUTRAL: confirmed only when the region speaks (reference)");
  assert.equal(read(field({ trust: 1 })), true, "full trust holds through one silent cycle");
  assert.equal(graceOf(1), 2);
  assert.equal(graceOf(NEUTRAL), 0);
});

// ── T2: trust reaches further back for the cause of a change ──

test("T2: under trust, an older emission is still matched as the cause", () => {
  const read = (f: ModField) => {
    const t2 = createT2({ window: 1, stabilityThreshold: 1 });
    const env = runLayer(createT1(), [], EMPTY, datum()).output;
    runLayer(t2, { env, emitted: { action: "X" }, changes: [] }, f, datum());
    const out = runLayer(t2, { env, emitted: { action: "Y" }, changes: [{ id: "c", value: "X" }] }, f, datum());
    return out.output.tagged[0]!.agency;
  };
  assert.equal(read(EMPTY), "ENV_PUSHED", "NEUTRAL: only the last emission is in reach");
  assert.equal(read(field({ trust: 1 })), "SELF_WRITTEN", "full trust reaches the one before");
});

// ── T3: exploration asks again ──

test("T3: leaning to explore, a cue asked before is asked again", () => {
  const described = { ch: (s: Signal) => ({ infoType: "raw", value: s.raw_payload, describe: { kind: "k" } }) };
  const asks = (f: ModField) => {
    const t3 = createT3(described);
    let n = 0;
    for (let i = 0; i < 10; i++) {
      n += runLayer(t3, { signals: [{ source_id: "ch", raw_payload: i, t: i }] }, f, datum()).emissions.length;
    }
    return n;
  };
  assert.equal(asks(EMPTY), 1, "NEUTRAL: asked once (reference)");
  assert.equal(asks(field({ exploration: 1 })), 2, "fully exploring: asked again after half the span");
});

// ── T4: trust recognises a named entity sooner ──

test("T4: with little trust, a named entity takes more sightings to be bound", () => {
  const first = (f: ModField) => runLayer(createT4(), { units: [unit("a", 1)] }, f, datum()).output.bound[0]!.entity_id;
  assert.equal(first(EMPTY), "a", "NEUTRAL: bound at once (reference)");
  assert.equal(first(field({ trust: 0 })), STRANGER, "no trust: not on the first sighting");
});

// ── T5: exploration keeps a shorter baseline; the rule receives the field ──

test("T5: exploring, it keeps a shorter baseline; confidence is untouched", () => {
  const read = (f: ModField) => {
    const t5 = createT5({ baselineWindow: 4 });
    let last;
    for (let i = 0; i < 6; i++) {
      last = runLayer(t5, { bound: [{ unit: unit("a", i), entity_id: "a" }] }, f, datum()).output.results[0]!;
    }
    return last!.expectation;
  };
  assert.equal(read(EMPTY).built_from.length, 4, "NEUTRAL: the declared window (reference)");
  assert.equal(read(field({ exploration: 1 })).built_from.length, 2, "fully exploring: half of it");
  assert.equal(read(field({ exploration: 1 })).confidence, read(EMPTY).confidence,
    "the field never reaches confidence (§13.4)");
});

test("T5: its rule receives the cycle's field", () => {
  let seen: ModField | undefined;
  const t5 = createT5({
    predict: (_id, _w, observed, _c, _a, _wr, _t, f) => {
      seen = f;
      return observed;
    },
  });
  const f = field({ alertness: 0.9 });
  runLayer(t5, { bound: [{ unit: unit("a", 1), entity_id: "a" }] }, f, datum());
  assert.equal(seen, f);
});

// ── T6: trust weighs the evidence of an independent Other ──

test("T6: under trust, one resistance counts for more", () => {
  const read = (f: ModField) => {
    const result = {
      entity_id: "a",
      expectation: { predicted: unit("a", 0), confidence: 0, recurrence: 0, built_from: [], held_by: [], held_by_declared: false },
      predErr: { observed: unit("a", 1), predicted: unit("a", 0), delta: 1, signed: "+" as const },
    };
    const out = runLayer(createT6(), { results: [result] }, f, datum()).output.others[0]!;
    return (out.independence_evidence as { resistances: number }).resistances;
  };
  assert.equal(read(EMPTY), 1, "NEUTRAL: one resistance, one count (reference)");
  assert.equal(read(field({ trust: 1 })), 1.5);
  assert.equal(read(field({ trust: 0 })), 0.5, "less, never nothing: the field does not annul evidence");
});

// ── T7: alertness keeps an entity demanded back longer ──

test("T7: the more alert, the longer an entity stays demanded back", () => {
  const read = (f: ModField) => {
    const t7 = createT7({ attentionSpan: 2 });
    const e = { entity_id: "a", predicted: unit("a", 1) };
    runLayer(t7, { expectations: [e], observed: new Set(["a"]) }, f, datum());
    runLayer(t7, { expectations: [], observed: new Set<string>() }, f, datum());
    runLayer(t7, { expectations: [], observed: new Set<string>() }, f, datum());
    return runLayer(t7, { expectations: [], observed: new Set<string>() }, f, datum()).output.absences.length;
  };
  assert.equal(read(EMPTY), 0, "NEUTRAL: out of attention after the declared span");
  assert.equal(read(field({ alertness: 1 })), 1, "fully alert: still demanded back");
});

// ── T8: exploration compares Others more deeply ──

test("T8: exploring, Others equal in resistance are told apart", () => {
  const other = (id: string, envPushed: number): OtherModel => ({
    entity_id: id,
    context_map: {},
    independence_evidence: { resistances: 1, envPushed },
  });
  const rank = (f: ModField) =>
    runLayer(createT8(), { others: [other("a", 0), other("b", 2)] }, f, datum()).output.relValues;
  assert.equal(rank(EMPTY)[0]!.comparison_basis, "resistance", "NEUTRAL: the reference basis");
  const deep = rank(field({ exploration: 1 }));
  assert.equal(deep[0]!.comparison_basis, "resistance+envPushed");
  assert.equal(deep[0]!.entity_id, "b", "the one that pushed more ranks first");
});

// ── appraisal: alertness weighs the resistance met ──

test("appraisal: the same resistance weighs more under alertness (§8.5)", () => {
  const predErrs = [{ observed: null, predicted: unit("a", 1), delta: 1, signed: "-" as const }];
  const valence = (f: ModField) =>
    appraise({ infoRef: "c", predErrs, field: f, editedState: "state" }).valence;
  assert.equal(valence(EMPTY), -1, "NEUTRAL: the reference valence");
  assert.equal(valence(field({ alertness: 1 })), -1.5);
  assert.equal(valence(field({ alertness: 0 })), -0.5, "less alert weighs it less, never not at all");
  assert.notEqual(APPRAISAL_ANCHOR_ID, "state");
});

// ── forward-building: exploration builds more situations ──

test("forward-building: exploring builds more situations, consolidating fewer", () => {
  const built = (exploration: number) => {
    const glob = createGlobMod({}, 0);
    const layers: Layers = {
      t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
      t5: createT5(), t6: createT6(), t7: createT7(), t8: createT8(),
    };
    const cycle = createCycle({
      layers, glob, data: createDataStore(), events: createEventLog(), initialEmission: { action: "boot" },
    });
    const signals = (): Signal[] =>
      ["a", "b", "c", "d", "e"].map((id) => ({ source_id: "ch", raw_payload: { entity: id, value: 1 }, t: 1 }));
    for (let i = 0; i < 3; i++) cycle.run({ signals: signals(), changes: [] });
    glob.restore({ [EXPLORATION]: exploration }, glob.cycle());
    const ref = cycle.run({ signals: signals(), changes: [] }).appraisal.info_ref;
    const m = /\+(\d+)proj$/.exec(ref);
    return m ? Number(m[1]) : 0;
  };
  assert.equal(built(NEUTRAL), 3, "NEUTRAL: H_COUNT (reference)");
  assert.equal(built(1), 5, "fully exploring: H_COUNT · 1½, rounded");
  assert.equal(built(0), 2, "fully consolidating: H_COUNT · ½, rounded, above a raised floor");
  assert.ok(ALERTNESS);
});
