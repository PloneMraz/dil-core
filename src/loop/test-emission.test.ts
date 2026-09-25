/**
 * T5 emits a test (protocol §6.4): "an action that pushes to the region to see
 * whether the return matches the Expectation just built".
 *
 * The rule thinks; it does not act. `test` records the action as an emission
 * from T5 — register ↔, one activity record naming T5 — readable by T2 next
 * cycle like every lateral emission, and handed to the host as
 * `CycleResult.tests`. dil-core has no body to carry it out; a host that has one
 * does.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createCycle, type Layers } from "./cycle.js";
import { createGlobMod } from "./glob-mod.js";
import {
  createT1, createT2, createT3, createT4, createT5, createT6, createT7, createT8,
} from "./layers/index.js";
import { persistence, regionTest, type PredictRule } from "./layers/t5.js";
import { createDataStore } from "../store/data-store.js";
import { createEventLog } from "../store/event-log.js";
import { deserializeEventRecord, serializeEventRecord } from "../store/event-sink.js";
import type { EmissionActivity } from "../store/resist-event.js";
import { checkConformance } from "../conformance/checker.js";
import type { Signal } from "./types.js";

function sig(value: unknown, t: number): Signal {
  return { source_id: "ch", raw_payload: { entity: "weather", value }, t };
}

/** A rule that, once per cycle, pushes "look up" to the region as a test. */
function testing(): PredictRule {
  let seen = -1;
  return (entityId, window, observed, contribute, ask, write, pushTest) => {
    if (observed.t !== seen) {
      seen = observed.t;
      pushTest?.({ kind: "move", to: "up", at: observed.t });
    }
    return persistence(entityId, window, observed, contribute, ask, write);
  };
}

function loop(rule: PredictRule) {
  const layers: Layers = {
    t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
    t5: createT5({ predict: rule }), t6: createT6(), t7: createT7(), t8: createT8(),
  };
  const events = createEventLog();
  let clock = 0;
  const cycle = createCycle({
    layers, glob: createGlobMod({ appraisalGain: 1 }, 0), data: createDataStore(), events,
    initialEmission: { action: "boot" }, now: () => ++clock,
  });
  return { cycle, events };
}

const emissions = (events: ReturnType<typeof createEventLog>) =>
  events.all().filter((r): r is EmissionActivity => r.kind === "activity" && r.activityKind === "emission");

test("a test is recorded as an emission from T5, register ↔, and handed to the host", () => {
  const { cycle, events } = loop(testing());
  const result = cycle.run({ signals: [sig("sun", 100)], changes: [] });

  assert.deepEqual(result.tests, [{ kind: "move", to: "up", at: 100 }]);
  const fromT5 = emissions(events).filter((e) => e.issuingLayer === 5);
  assert.equal(fromT5.length, 1);
  assert.deepEqual(fromT5[0]!.action, regionTest({ kind: "move", to: "up", at: 100 }));
  assert.equal(fromT5[0]!.register, "↔");
});

test("a rule that tests nothing leaves no test, and the cycle is as it was", () => {
  const { cycle, events } = loop(persistence);
  const result = cycle.run({ signals: [sig("sun", 100)], changes: [] });
  assert.deepEqual(result.tests, []);
  assert.equal(emissions(events).filter((e) => e.issuingLayer === 5).length, 0);
});

test("the trace with tests is accepted and survives the sink", () => {
  const { cycle, events } = loop(testing());
  for (const [i, v] of ["sun", "rain", "sun"].entries()) cycle.run({ signals: [sig(v, 100 + i)], changes: [] });
  const report = checkConformance(events);
  assert.deepEqual(report.results.filter((r) => r.verdict === "fail").map((r) => `${r.id}: ${r.detail}`), []);
  for (const rec of events.all()) assert.deepEqual(deserializeEventRecord(serializeEventRecord(rec)), rec);
});
