/**
 * Reading the record (protocol v0.3.9 §9).
 *
 * The whole store is the agent's history: `[data]` its memory, `[event]` the
 * record of what happened, which the agent reads and never alters. The rule
 * reads it through the cycle's view — an open link, handed to it every cycle —
 * and each read leaves one `read-record` line for each purpose, naming the
 * records by their place in the chain, never their content. What the agent
 * learns from it is written to `[data]`, naming the record as `event:<seq>`.
 * The checker holds both to the record the log held before the cycle that read.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

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
import { createDurableEventLog, createEventLog, type EventLog } from "../store/event-log.js";
import { deserializeEventRecord, serializeEventRecord } from "../store/event-sink.js";
import { recordReadRecord, type ReadRecordActivity } from "../store/resist-event.js";
import { checkConformance } from "../conformance/checker.js";
import type { Signal } from "./types.js";

function weather(value: unknown, t: number): Signal {
  return { source_id: "ch", raw_payload: { entity: "weather", value }, t };
}

/** A rule that reads the record each cycle: the cycle before's seal, and learns from it. */
function recordReadingRule(clock: { cycle: number }): PredictRule {
  return (entityId, window, observed, contribute, ask, write, _test, _field, _read, record) => {
    if (record && clock.cycle > 0) {
      const lines = record.about(`cycle-${clock.cycle - 1}`, "what happened", 3);
      if (lines.length > 0) {
        write({
          payload: { lines: lines.length },
          open: { domain: "mind", kind: "note", source: "rule" },
          builtFrom: lines.map((l) => `event:${l.seq}`),
        });
      }
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

function readRecordLines(events: EventLog): ReadRecordActivity[] {
  return events.all().filter((r): r is ReadRecordActivity => r.kind === "activity" && r.activityKind === "read-record");
}

test("the rule reads what happened in the cycle before, and each read leaves a line by seq", () => {
  const events = createEventLog();
  const clock = { cycle: 0 };
  run(events, recordReadingRule(clock), clock, 3);
  const lines = readRecordLines(events);
  assert.deepEqual(lines.map((l) => [l.cycleMark, l.issuingLayer, l.purpose, l.records.length]), [
    [1, 5, "what happened", 3],
    [2, 5, "what happened", 3],
  ]);
  const all = events.all();
  for (const l of lines) {
    assert.equal(l.datumId, `cycle-${l.cycleMark}`, "the line is the cycle datum's");
    for (const seq of l.records) {
      const r = all[seq]!;
      assert.ok(r.kind === "activity" && r.datumId === `cycle-${l.cycleMark - 1}`, "each record read is of the cycle before");
    }
  }
  for (const rec of all) assert.deepEqual(deserializeEventRecord(serializeEventRecord(rec)), rec);
});

test("what is learned from the record names it, and the checker passes both", () => {
  const events = createEventLog();
  const clock = { cycle: 0 };
  run(events, recordReadingRule(clock), clock, 4);
  const c6 = checkConformance(events).results.find((r) => r.id === "6")!;
  assert.equal(c6.verdict, "pass", c6.detail);
  assert.ok(c6.claims.some((c) => c.claim.startsWith("every record read of `[event]`") && c.verdict === "pass"));
});

test("a read of a record the log did not hold before the cycle is caught", () => {
  const events = createEventLog();
  const clock = { cycle: 0 };
  run(events, recordReadingRule(clock), clock, 2);
  const ofCycle1 = events.all().findIndex((r) => r.kind === "activity" && r.activityKind === "layer-exit" && r.cycleMark === 1);
  events.append(recordReadRecord("cycle-1", 1, 5, "look", [ofCycle1], 1));
  const c6 = checkConformance(events).results.find((r) => r.id === "6")!;
  assert.equal(c6.verdict, "fail");
  assert.match(c6.detail, new RegExp(`record #${ofCycle1}, read at cycle 1`));
});

test("a rule that does not read the record leaves no `read-record` line", () => {
  const events = createEventLog();
  const clock = { cycle: 0 };
  run(events, persistence, clock, 3);
  assert.equal(readRecordLines(events).length, 0);
});

test("the durable log reads back from disk, across segments, as the log in memory does", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dil-read-record-"));
  try {
    const durable = createDurableEventLog(dir, { maxSegmentBytes: 4096, dateStamp: () => "20261025" });
    const clock = { cycle: 0 };
    run(durable, recordReadingRule(clock), clock, 6);
    durable.sync();
    const all = durable.all();
    assert.ok(fs.readdirSync(dir).length > 2, "several segments");
    for (const [before, scan] of [[all.length, 50], [all.length - 7, 13], [40, 100], [3, 3], [0, 5]] as const) {
      const expected = all
        .slice(Math.max(0, before - scan), before)
        .map((record, i, kept) => ({ seq: before - kept.length + i, record }))
        .reverse();
      assert.deepEqual(durable.back(before, scan), expected, `before ${before}, scan ${scan}`);
    }
    durable.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("cycles reads the seals of the latest cycles, newest first, each a record read", () => {
  const events = createEventLog();
  const clock = { cycle: 0 };
  const seen: number[][] = [];
  const rule: PredictRule = (entityId, window, observed, contribute, ask, write, _test, _field, _read, record) => {
    if (record) seen.push(record.cycles("what happened", 2).map((r) => (r.record.kind === "activity" && r.record.activityKind === "cycle-seal" ? r.record.activity.cycle : -1)));
    return persistence(entityId, window, observed, contribute, ask, write);
  };
  run(events, rule, clock, 4);
  assert.deepEqual(seen, [[], [0], [1, 0], [2, 1]]);
  const lines = readRecordLines(events);
  assert.deepEqual(lines.map((l) => [l.cycleMark, l.purpose, l.records.length]), [[1, "what happened", 1], [2, "what happened", 2], [3, "what happened", 2]]);
});

test("the durable log read record by record stops where the reader stops, and agrees with back", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dil-read-record-"));
  try {
    const durable = createDurableEventLog(dir, { maxSegmentBytes: 4096, dateStamp: () => "20261025" });
    const clock = { cycle: 0 };
    run(durable, recordReadingRule(clock), clock, 5);
    durable.sync();
    const n = durable.size();
    const firstThree: number[] = [];
    for (const r of durable.iterBack(n, 1000)) {
      firstThree.push(r.seq);
      if (firstThree.length === 3) break;
    }
    assert.deepEqual(firstThree, [n - 1, n - 2, n - 3]);
    assert.deepEqual([...durable.iterBack(n - 4, 9)], durable.back(n - 4, 9));
    durable.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
