/**
 * Reading memory (protocol v0.3.7 §9).
 *
 * T5's rule reads `[data]` directly, through the cycle's read-only view: a datum
 * as `[data]` holds it, in the cycle, with no query and no pass through the
 * layers. Memory alone — a datum admitted in the cycle reading is not returned.
 * Each cycle's reads leave one `read` line for each purpose in `[event]`, ids
 * only, and the checker holds each to have entered before the cycle that read it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createCycle, type Layers } from "./cycle.js";
import { createGlobMod } from "./glob-mod.js";
import { createT1 } from "./layers/t1.js";
import { createT2 } from "./layers/t2.js";
import { createT3 } from "./layers/t3.js";
import { createT4 } from "./layers/t4.js";
import { createT5, persistence, type PredictRule } from "./layers/t5.js";
import { createT6 } from "./layers/t6.js";
import { createT7 } from "./layers/t7.js";
import { createT8 } from "./layers/t8.js";
import { createDataStore } from "../store/data-store.js";
import { createEventLog, type EventLog } from "../store/event-log.js";
import { deserializeEventRecord, serializeEventRecord } from "../store/event-sink.js";
import { recordRead, type ReadActivity } from "../store/resist-event.js";
import { checkConformance } from "../conformance/checker.js";
import type { Signal } from "./types.js";

function weather(value: unknown, t: number): Signal {
  return { source_id: "ch", raw_payload: { entity: "weather", value }, t };
}

/** What the rule saw when it read, each cycle. */
interface Seen {
  readonly cycle: number;
  readonly now: unknown; // the datum admitted this cycle, read by id
  readonly before: unknown; // the datum admitted the cycle before
}

/** A rule that reads, by id, the frame of this cycle and of the one before. */
function readingRule(clock: { cycle: number }, seen: Seen[]): PredictRule {
  return (entityId, window, observed, contribute, ask, write, _test, _field, read) => {
    if (read) {
      const now = read.read(`signal-${clock.cycle}-0`, "state");
      const before = clock.cycle > 0 ? read.read(`signal-${clock.cycle - 1}-0`, "state") : undefined;
      seen.push({ cycle: clock.cycle, now, before });
      assert.equal(read.idOf(observed), undefined, "this cycle's unit names its datum only after the pass");
    }
    return persistence(entityId, window, observed, contribute, ask, write);
  };
}

function run(events: EventLog, rule: PredictRule, clock: { cycle: number }, cycles: number): void {
  const layers: Layers = {
    t1: createT1(), t2: createT2(), t3: createT3({}), t4: createT4(),
    t5: createT5({ predict: rule }), t6: createT6(), t7: createT7(), t8: createT8(),
  };
  const cycle = createCycle({
    layers,
    glob: createGlobMod({ appraisalGain: 1 }, 0),
    data: createDataStore(),
    events,
    initialEmission: { action: "boot" },
  });
  for (let t = 0; t < cycles; t++) {
    clock.cycle = t;
    cycle.run({ signals: [weather(t % 2 ? "sun" : "rain", t)], changes: [] });
  }
}

function readLines(events: EventLog): ReadActivity[] {
  return events.all().filter((r): r is ReadActivity => r.kind === "activity" && r.activityKind === "read");
}

test("the rule reads memory: an earlier cycle's datum, never the one admitted in the cycle reading", () => {
  const events = createEventLog();
  const seen: Seen[] = [];
  const clock = { cycle: 0 };
  run(events, readingRule(clock, seen), clock, 3);
  assert.ok(seen.length >= 3);
  for (const s of seen) {
    assert.equal(s.now, undefined, `cycle ${s.cycle}: what arrives in a cycle is met in it, not recalled`);
  }
  const later = seen.filter((s) => s.cycle > 0);
  assert.ok(later.every((s) => s.before !== undefined), "the cycle before's datum is memory, and is read");
});

test("each cycle's reads leave one `read` line for each purpose, ids only, and pass the checker", () => {
  const events = createEventLog();
  const clock = { cycle: 0 };
  run(events, readingRule(clock, []), clock, 3);
  const lines = readLines(events);
  assert.deepEqual(lines.map((l) => [l.cycleMark, l.issuingLayer, l.purpose, l.read]), [
    [1, 5, "state", ["signal-0-0"]],
    [2, 5, "state", ["signal-1-0"]],
  ]);
  assert.ok(lines.every((l) => l.datumId === `cycle-${l.cycleMark}`), "the line is the cycle datum's");
  for (const rec of events.all()) assert.deepEqual(deserializeEventRecord(serializeEventRecord(rec)), rec);
  const c6 = checkConformance(events).results.find((r) => r.id === "6")!;
  assert.equal(c6.verdict, "pass", c6.detail);
  assert.ok(c6.claims.some((c) => c.claim.startsWith("every datum read of `[data]`") && c.verdict === "pass"));
});

test("a read of a datum with no entry before the cycle that read it is caught", () => {
  const events = createEventLog();
  const clock = { cycle: 0 };
  run(events, readingRule(clock, []), clock, 2);
  events.append(recordRead("cycle-1", 1, 5, "state", ["never-entered"], 1));
  const c6 = checkConformance(events).results.find((r) => r.id === "6")!;
  assert.equal(c6.verdict, "fail");
  assert.match(c6.detail, /never-entered/);
});

test("a rule that does not read is unchanged, and leaves no `read` line", () => {
  const events = createEventLog();
  const clock = { cycle: 0 };
  run(events, persistence, clock, 3);
  assert.equal(readLines(events).length, 0);
});
