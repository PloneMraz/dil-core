/**
 * The mind at the loop's seams (CONTEXT.md §5a): it receives every arrival, expects
 * without the answer, looks, thinks on what failed, asks its memory, writes what
 * it learned with what it was built from, and commands — and the model it thinks
 * with is replaceable.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createCycle, type Layers } from "../loop/cycle.js";
import { createGlobMod } from "../loop/glob-mod.js";
import {
  createT1, createT2, createT3, createT4, createT5, createT6, createT7, createT8,
} from "../loop/layers/index.js";
import type { PredictRule } from "../loop/layers/t5.js";
import { createDataStore } from "../store/data-store.js";
import { createEventLog, type EventLog } from "../store/event-log.js";
import type { CycleSealActivity } from "../store/resist-event.js";
import type { ModField, Signal } from "../loop/types.js";
import { createMind, MIND_TAGS } from "./mind.js";
import { standingModel, type Context, type Model, type Situation } from "./model.js";

/** What the region returns for the weather, as the default transducer passes it on. */
const w = (value: unknown) => ({ entity: "weather", value });

function sig(value: unknown, i: number): Signal {
  return { source_id: "ch", raw_payload: { entity: "weather", value }, t: 100 + i };
}

function loop(predict?: PredictRule, seed: Record<string, number> = {}) {
  const layers: Layers = {
    t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
    t5: createT5(predict ? { predict } : {}), t6: createT6(), t7: createT7(), t8: createT8(),
  };
  const data = createDataStore();
  const events = createEventLog();
  const glob = createGlobMod(seed, 0);
  let t = 0;
  const cycle = createCycle({ layers, glob, data, events, initialEmission: { action: "boot" }, now: () => ++t });
  let i = 0;
  const step = (...values: unknown[]) =>
    cycle.run({ signals: values.map((v) => sig(v, i++)), changes: [] });
  return { step, data, events, glob };
}

function written(events: EventLog) {
  return events
    .all()
    .filter((r): r is CycleSealActivity => r.kind === "activity" && r.activityKind === "cycle-seal")
    .flatMap((r) => r.activity.written ?? []);
}

function expectations(events: EventLog) {
  return events.all().filter((r) => r.kind === "activity" && r.activityKind === "expectation");
}

test("thinking with the standing model, the mind is the reference law exactly", () => {
  const values = ["sun", "sun", "rain", "rain", "sun"];
  const ref = loop();
  const withMind = loop(createMind(standingModel).rule);
  for (const v of values) {
    ref.step(v);
    withMind.step(v);
  }
  const strip = (e: EventLog) => JSON.stringify(expectations(e).map((r) => ({ ...r, t: 0 })));
  assert.equal(strip(withMind.events), strip(ref.events));
});

test("the model is asked what will come back without being shown it (INV-8)", () => {
  const asked: Situation[] = [];
  const model: Model = {
    expect: (s) => {
      asked.push(s);
      return {};
    },
  };
  const { step } = loop(createMind(model).rule);
  step("sun");
  step("rain");
  assert.equal(asked.length, 2);
  assert.ok(!("value" in asked[1]!), "no answer in the situation");
  assert.deepEqual(asked[1]!.window, [w("sun")], "what it returned before");
});

test("the model's expectation is the loop's, and a mismatch reaches it as a scar", () => {
  const model: Model = { expect: () => ({ value: w("sun"), heldBy: [] }) };
  const mind = createMind(model);
  const { step } = loop(mind.rule);
  const r1 = step("sun");
  const r2 = step("rain");
  assert.equal(r1.scars, 0, "held");
  assert.ok(r2.scars > 0, "failed, and scarred");
  assert.equal(mind.report().held, 1);
});

test("on a failed expectation it thinks; what it writes enters the store, built from what it met", () => {
  const model: Model = {
    expect: () => ({ value: w("sun") }),
    think: (c: Context) => ({
      writes: [{ payload: { saw: "a change" }, builtFrom: [...c.windowUnits, c.unit] }],
    }),
  };
  const mind = createMind(model);
  const { step, events, data } = loop(mind.rule);
  step("sun");
  step("rain");
  const [entry] = written(events);
  assert.ok(entry, "a datum written");
  assert.deepEqual(entry!.builtFrom, ["signal-0-0", "signal-1-0"], "by ids, never content");
  const datum = data.get(entry!.datumId)!;
  assert.equal(datum.fixed.provenance, "nascent");
  assert.equal(datum.open.domain, MIND_TAGS.domain);
  assert.equal(datum.open.kind, "thought");
});

test("what it asks its memory is a query from T5, and the answer reaches its next thought", () => {
  const recalledSeen: number[] = [];
  let asked = false;
  const model: Model = {
    expect: () => ({ value: "never" }),
    observe: (a) => (a.cycle === 0 ? [{ payload: { first: a.value }, tags: { kind: "note" }, builtFrom: [a.unit] }] : []),
    think: (c) => {
      recalledSeen.push(c.recalled.length);
      if (asked) return null;
      asked = true;
      return { asks: [{ kind: "note" }] };
    },
  };
  const { step, events } = loop(createMind(model).rule);
  step("a");
  step("b");
  step("c");
  step("d");
  const queries = events
    .all()
    .filter((r) => r.kind === "activity" && r.activityKind === "emission")
    .map((r) => JSON.stringify(r));
  assert.ok(queries.some((q) => q.includes('"kind":"query"') && q.includes('"issuingLayer":5')), "asked from T5");
  assert.ok(recalledSeen.some((n) => n > 0), `memory's answer reached a thought: ${recalledSeen}`);
});

test("what it proposes is commanded as T5's test", () => {
  const model: Model = {
    expect: () => ({}),
    propose: (c) => ((c.value as { value: unknown }).value === "rain" ? { action: { kind: "open-umbrella" }, why: "rain" } : null),
  };
  const mind = createMind(model);
  const { step } = loop(mind.rule);
  assert.deepEqual(step("sun").tests, []);
  assert.deepEqual(step("rain").tests, [{ kind: "open-umbrella" }]);
  assert.equal(mind.report().commands.length, 1);
});

test("the field reaches the mind, and alertness lets it think more often in a cycle", () => {
  const thoughtsIn = (seed: Record<string, number>) => {
    let n = 0;
    let field: ModField | undefined;
    const model: Model = {
      expect: (s) => {
        field = s.field;
        return { value: "never" };
      },
      think: () => {
        n += 1;
        return null;
      },
    };
    const { step } = loop(createMind(model).rule, seed);
    step("a", "b", "c");
    assert.ok(field !== undefined, "the field reached the model");
    return n;
  };
  // Cycle 0's field is the host's seed: NEUTRAL thinks once, full alertness twice.
  assert.equal(thoughtsIn({}), 1);
  assert.equal(thoughtsIn({ alertness: 1 }), 2);
});

test("the model is replaceable: another model, the same mind and the same seams", () => {
  const a = createMind(standingModel);
  const b = createMind({ expect: () => ({ value: w("sun") }) });
  const la = loop(a.rule);
  const lb = loop(b.rule);
  for (const v of ["sun", "rain", "sun"]) {
    la.step(v);
    lb.step(v);
  }
  assert.equal(a.report().expectations, b.report().expectations);
  assert.notEqual(a.report().held, b.report().held, "how well it thinks differs; what it is does not");
});
