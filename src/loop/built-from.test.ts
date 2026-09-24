/**
 * A datum the agent writes says what it was built from (protocol v0.3.4 §9).
 *
 * As an Expectation carries `built_from` and a Directive its Appraisals (§6.1),
 * a datum the agent writes — anew or by revision — records the ids of the data
 * it drew on: observations from the rule's window and the one in front of it,
 * and data it recalled. Ids only, never content. With it a third party can follow
 * the whole chain: which data → which version → which expectation → which scar.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createCycle, type Layers } from "./cycle.js";
import { createGlobMod } from "./glob-mod.js";
import {
  createT1, createT2, createT3, createT4, createT5, createT6, createT7, createT8,
} from "./layers/index.js";
import { persistence, type PredictRule, type WriteRequest } from "./layers/t5.js";
import { createDataStore } from "../store/data-store.js";
import { createEventLog, type EventLog } from "../store/event-log.js";
import { deserializeEventRecord, serializeEventRecord } from "../store/event-sink.js";
import type { CycleSealActivity, LogRecord } from "../store/resist-event.js";
import { checkConformance } from "../conformance/checker.js";
import type { InfoUnit, Signal } from "./types.js";

const TAGS = { domain: "world-model", kind: "program", source: "mind" };

function sig(value: unknown): Signal {
  return { source_id: "ch", raw_payload: { entity: "weather", value }, t: 0 };
}

/** A rule that, at the given cycle, writes once, built from what `from` picks. */
function writer(at: number, from: (window: readonly InfoUnit[], observed: InfoUnit) => WriteRequest["builtFrom"]) {
  let cycle = -1;
  let seenAt = -1;
  const rule: PredictRule = (entityId, window, observed, contribute, ask, write) => {
    if (observed.t !== seenAt) {
      seenAt = observed.t;
      cycle += 1;
      if (cycle === at) write({ payload: { v: 1 }, open: TAGS, builtFrom: from(window, observed) });
    }
    return persistence(entityId, window, observed, contribute, ask, write);
  };
  return rule;
}

function loop(rule: PredictRule) {
  const layers: Layers = {
    t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
    t5: createT5({ predict: rule }), t6: createT6(), t7: createT7(), t8: createT8(),
  };
  const data = createDataStore();
  const events = createEventLog();
  let t = 0;
  const cycle = createCycle({
    layers, glob: createGlobMod({ appraisalGain: 1 }, 0), data, events,
    initialEmission: { action: "boot" }, now: () => ++t,
  });
  // Each cycle's return carries its own time, so the rule can tell cycles apart.
  const step = (i: number, v: unknown) => cycle.run({ signals: [{ ...sig(v), t: 100 + i }], changes: [] });
  return { step, data, events };
}

function written(events: EventLog) {
  return events
    .all()
    .filter((r): r is CycleSealActivity => r.kind === "activity" && r.activityKind === "cycle-seal")
    .flatMap((r) => r.activity.written ?? []);
}

test("observations from the window and the one in front of it are recorded by their datum ids", () => {
  const { step, events } = loop(writer(2, (window, observed) => [...window, observed]));
  step(0, "sun");
  step(1, "sun");
  step(2, "rain");

  const [w] = written(events);
  assert.deepEqual(w!.builtFrom, ["signal-0-0", "signal-1-0", "signal-2-0"]);
  assert.equal(JSON.stringify(w).includes("rain"), false, "ids, never content");
});

test("a datum named by id is recorded as named, and an empty list says nothing held went into it", () => {
  const byId = loop(writer(1, () => ["signal-0-0", "signal-0-0"]));
  byId.step(0, "sun");
  byId.step(1, "sun");
  assert.deepEqual(written(byId.events)[0]!.builtFrom, ["signal-0-0"], "each once");

  const none = loop(writer(0, () => []));
  none.step(0, "sun");
  assert.deepEqual(written(none.events)[0]!.builtFrom, []);
});

test("what it was built from must be data: an unknown id, a unit from no datum, or nothing said is refused", () => {
  const ghost = loop(writer(0, () => ["ghost"]));
  assert.throws(() => ghost.step(0, "sun"), /"ghost", which is no datum/);

  const made: InfoUnit = { content: { invented: true }, ref_frame: { boundLayer: 5, ref: "rule" }, t: 0 };
  const invented = loop(writer(0, () => [made]));
  assert.throws(() => invented.step(0, "sun"), /a unit that came from no datum/);

  const silent = loop(writer(0, () => undefined as unknown as []));
  assert.throws(() => silent.step(0, "sun"), /must say what it was built from/);
});

test("the checker reads it: a written datum naming data with no entry fails", () => {
  const { step, events } = loop(writer(1, (window, observed) => [...window, observed]));
  step(0, "sun");
  step(1, "rain");
  const report = checkConformance(events);
  assert.deepEqual(report.results.filter((r) => r.verdict === "fail").map((r) => r.id), []);
  const c6 = report.results.find((r) => r.id === "6")!;
  assert.ok(c6.claims.some((c) => c.claim.startsWith("every datum the agent wrote says what it was built from") && c.verdict === "pass"));
  for (const rec of events.all()) assert.deepEqual(deserializeEventRecord(serializeEventRecord(rec)), rec);

  // The same trace, with the written datum claiming a source the log never saw enter.
  const forged = createEventLog();
  for (const r of events.all()) {
    const seal = r as LogRecord;
    if (seal.kind === "activity" && seal.activityKind === "cycle-seal" && seal.activity.written) {
      forged.append({
        ...seal,
        activity: { ...seal.activity, written: seal.activity.written.map((w) => ({ ...w, builtFrom: ["ghost"] })) },
      });
    } else {
      forged.append(r);
    }
  }
  const forgedC6 = checkConformance(forged).results.find((r) => r.id === "6")!;
  assert.equal(forgedC6.verdict, "fail");
  assert.match(forgedC6.detail, /written at cycle 1, does not say what it was built from, or names data with no recorded entry/);
});
