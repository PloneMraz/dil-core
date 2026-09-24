/**
 * What the region returns is data (§3, §9).
 *
 * An expectation is compared against the region's return, and a `scar` is the
 * datum that "collided with resistance and held". Each return therefore enters
 * `[data]` through the tagging-gate, runs, leaves a line at every layer it exits,
 * and is itself the datum that moves to `scar` when the expectation about it
 * fails. Memory recalled on a cue is what the store held before the cycle that
 * asks.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { admitReturn, createCycle, type AdmitPolicy, type Layers } from "./cycle.js";
import { createGlobMod } from "./glob-mod.js";
import { createT1 } from "./layers/t1.js";
import { createT2 } from "./layers/t2.js";
import { createT3, type ChannelTransducer } from "./layers/t3.js";
import { createT4 } from "./layers/t4.js";
import { createT5 } from "./layers/t5.js";
import { createT6 } from "./layers/t6.js";
import { createT7 } from "./layers/t7.js";
import { createT8 } from "./layers/t8.js";
import { createDataStore, type DataStore } from "../store/data-store.js";
import { createEventLog, type EventLog } from "../store/event-log.js";
import { deserializeEventRecord, serializeEventRecord } from "../store/event-sink.js";
import type { CycleSealActivity, EventRecord, LayerExitActivity, ProvenanceActivity } from "../store/resist-event.js";
import { checkConformance } from "../conformance/checker.js";
import type { Signal } from "./types.js";

function weather(value: unknown, t = 1): Signal {
  return { source_id: "ch", raw_payload: { entity: "weather", value }, t };
}

function cycleOver(
  data: DataStore,
  events: EventLog,
  opts: { admit?: AdmitPolicy; transducers?: Record<string, ChannelTransducer> } = {},
) {
  const layers: Layers = {
    t1: createT1(),
    t2: createT2(),
    t3: createT3(opts.transducers ?? {}),
    t4: createT4(),
    t5: createT5(),
    t6: createT6(),
    t7: createT7(),
    t8: createT8(),
  };
  return createCycle({
    layers,
    glob: createGlobMod({ appraisalGain: 1 }, 0),
    data,
    events,
    initialEmission: { action: "boot" },
    ...(opts.admit !== undefined ? { admit: opts.admit } : {}),
  });
}

function moves(events: EventLog, id: string): string[] {
  return events
    .all()
    .filter((r): r is ProvenanceActivity => r.kind === "activity" && r.activityKind === "provenance" && r.datumId === id)
    .map((r) => `${r.from}→${r.to}`);
}

function exits(events: EventLog, id: string): number[] {
  return events
    .all()
    .filter((r): r is LayerExitActivity => r.kind === "activity" && r.activityKind === "layer-exit" && r.datumId === id)
    .map((r) => r.layer);
}

function scars(events: EventLog): EventRecord[] {
  return events.all().filter((r): r is EventRecord => r.kind === "scar");
}

test("a return from the region is a running datum, tagged by what can be seen of it", () => {
  const data = createDataStore();
  const events = createEventLog();
  cycleOver(data, events).run({ signals: [weather("sun")], changes: [] });

  const d = data.get("signal-0-0")!;
  assert.deepEqual(d.payload, { entity: "weather", value: "sun" });
  assert.equal(d.fixed.provenance, "running");
  assert.equal(d.fixed.cycleMark, 0);
  assert.equal(d.fixed.floorTag, 8, "it left T8 with the cycle datum");
  assert.deepEqual(d.open, { domain: "region", source: "ch", format: "object" });
  assert.deepEqual(moves(events, "signal-0-0"), ["prior→running"]);
});

test("every layer a return exits is in the log, and its tags are in the cycle's record", () => {
  const data = createDataStore();
  const events = createEventLog();
  cycleOver(data, events).run({ signals: [weather("sun")], changes: [] });

  assert.deepEqual(exits(events, "signal-0-0"), [1, 2, 3, 4, 5, 6, 7, 8]);
  const seal = events.all().find((r): r is CycleSealActivity => r.kind === "activity" && r.activityKind === "cycle-seal")!;
  assert.deepEqual(seal.activity.admitted?.map((t) => t.datumId), ["signal-0-0"]);
  assert.equal(JSON.stringify(seal.activity.admitted).includes("sun"), false, "tags, never content");
});

test("the return the expectation failed on is the datum that becomes the scar, and the record names it", () => {
  const data = createDataStore();
  const events = createEventLog();
  const cycle = cycleOver(data, events);
  cycle.run({ signals: [weather("sun")], changes: [] });
  cycle.run({ signals: [weather("rain")], changes: [] }); // persistence expected "sun"

  assert.equal(data.get("signal-1-0")!.fixed.provenance, "scar");
  assert.equal(data.get("signal-0-0")!.fixed.provenance, "running", "the earlier return did not collide");
  assert.deepEqual(moves(events, "signal-1-0"), ["prior→running", "running→scar"]);

  const [scar, ...more] = scars(events);
  assert.equal(more.length, 0);
  assert.equal(scar!.datumId, "signal-1-0");
  assert.deepEqual(scar!.scar.payload, { entity: "weather", value: "rain" });
  assert.deepEqual((scar!.event.expected as { value: { value: string } }).value.value, "sun");
});

test("a host declares its own tags, or keeps a return out", () => {
  const data = createDataStore();
  const events = createEventLog();
  const admit: AdmitPolicy = (s) =>
    s.source_id === "ch"
      ? { payload: s.raw_payload, admittingLayer: 1, open: { domain: "observation", kind: "weather", source: "ch" } }
      : null;
  cycleOver(data, events, { admit }).run({
    signals: [weather("sun"), { source_id: "noise", raw_payload: 1, t: 1 }],
    changes: [],
  });

  assert.equal(data.get("signal-0-0")!.open.kind, "weather");
  assert.equal(data.get("signal-0-1"), undefined, "the host kept that one out");
  assert.deepEqual(exits(events, "signal-0-1"), []);
});

test("memory is what the store held before the cycle that asks, not what just arrived", () => {
  const data = createDataStore();
  const events = createEventLog();
  // T3 asks the store with every arrival's description, and the host tags each
  // return with the same description, so the cue matches the returns themselves.
  const described: ChannelTransducer = (s) => ({ infoType: "weather", value: s.raw_payload, describe: { kind: "weather" } });
  const admit: AdmitPolicy = (s) => ({
    payload: s.raw_payload,
    admittingLayer: 1,
    open: { domain: "observation", kind: "weather", source: s.source_id },
  });
  const cycle = cycleOver(data, events, { admit, transducers: { ch: described } });
  cycle.run({ signals: [weather("sun")], changes: [] }); // asks { kind: weather } now
  cycle.run({ signals: [weather("sun")], changes: [] });

  const recalled = events
    .all()
    .filter((r): r is CycleSealActivity => r.kind === "activity" && r.activityKind === "cycle-seal")
    .flatMap((r) => r.activity.recalled ?? []);
  assert.deepEqual(recalled, [], "the arrival that raised the cue is not its own memory");
});

test("the new fields survive the sink, and a cycle with no return writes none", () => {
  const data = createDataStore();
  const events = createEventLog();
  const cycle = cycleOver(data, events);
  cycle.run({ signals: [weather("sun")], changes: [] });
  cycle.run({ signals: [weather("rain")], changes: [] });
  for (const rec of events.all()) assert.deepEqual(deserializeEventRecord(serializeEventRecord(rec)), rec);

  const quiet = createEventLog();
  cycleOver(createDataStore(), quiet).run({ signals: [], changes: [] });
  const seal = quiet.all().find((r): r is CycleSealActivity => r.kind === "activity" && r.activityKind === "cycle-seal")!;
  assert.equal("admitted" in seal.activity, false);
});

test("a run that keeps its returns leaves a trace the checker accepts", () => {
  const events = createEventLog();
  const cycle = cycleOver(createDataStore(), events);
  for (const v of ["sun", "sun", "rain", "rain"]) cycle.run({ signals: [weather(v)], changes: [] });

  const report = checkConformance(events);
  assert.deepEqual(report.results.filter((r) => r.verdict === "fail").map((r) => `${r.id}: ${r.detail}`), []);
  const c3 = report.results.find((r) => r.id === "3")!;
  assert.ok(c3.claims.some((c) => c.claim.startsWith("every region return's path") && c.verdict === "pass"));
});

test("the reference admission is exported for hosts that extend it", () => {
  const d = admitReturn({ source_id: "x", raw_payload: [1, 2], t: 0 })!;
  assert.deepEqual(d.open, { domain: "region", source: "x", format: "array" });
});
