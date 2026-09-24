/**
 * What the agent writes (protocol v0.3.3 §9).
 *
 * A datum the agent writes anew enters at `nascent`, bearing the cycle-mark of
 * the cycle that wrote it; it arrives at T1 the next cycle, is classified
 * SELF_WRITTEN at T2, runs every layer, and moves `nascent → running`. A
 * revision of a datum already held changes its content and not its provenance,
 * and leaves a bare `revision` line. A cue may ask by provenance.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createCycle, type Layers } from "./cycle.js";
import { createGlobMod } from "./glob-mod.js";
import { createT1 } from "./layers/t1.js";
import { createT2, type T2Output } from "./layers/t2.js";
import { createT3 } from "./layers/t3.js";
import { createT4 } from "./layers/t4.js";
import { createT5, persistence, type PredictRule, type WriteRequest } from "./layers/t5.js";
import { createT6 } from "./layers/t6.js";
import { createT7 } from "./layers/t7.js";
import { createT8 } from "./layers/t8.js";
import { answerQuery } from "./store-query.js";
import { createDataStore, type DataStore } from "../store/data-store.js";
import { createEventLog, type EventLog } from "../store/event-log.js";
import { admitArrival, TaggingGateError } from "../store/tagging-gate.js";
import { deserializeEventRecord, serializeEventRecord } from "../store/event-sink.js";
import {
  recordLayerExit,
  recordRevision,
  type CycleSealActivity,
  type LayerExitActivity,
  type ProvenanceActivity,
  type RevisionActivity,
} from "../store/resist-event.js";
import { checkConformance } from "../conformance/checker.js";
import type { Signal } from "./types.js";

const MODEL_TAGS = { domain: "world-model", kind: "program", object: "weather" };

function weather(value: unknown, t = 1): Signal {
  return { source_id: "ch", raw_payload: { entity: "weather", value }, t };
}

/** The cycle the test is running, set before each run. */
const clock = { cycle: 0 };

/**
 * A rule that writes what the plan holds for the current cycle, once, on the
 * first entity it meets; it records every observation it met.
 */
function writingRule(plan: Map<number, WriteRequest>, met: unknown[]): PredictRule {
  let lastCycle = -1;
  return (entityId, window, observed, contribute, ask, write) => {
    met.push(observed.content);
    if (clock.cycle !== lastCycle) {
      lastCycle = clock.cycle;
      const request = plan.get(clock.cycle);
      if (request !== undefined) write(request);
    }
    return persistence(entityId, window, observed, contribute, ask, write);
  };
}

/** Run one cycle with the clock set to it. */
function step(cycle: { run: (i: { signals: Signal[]; changes: [] }) => unknown }, t: number, value = "sun"): void {
  clock.cycle = t;
  cycle.run({ signals: [weather(value, t)], changes: [] });
}

function cycleOver(data: DataStore, events: EventLog, rule: PredictRule, agency: T2Output[] = []) {
  // Stable from the first cycle, so the tag a write earns is visible at once.
  const t2 = createT2({ stabilityThreshold: 1 });
  const process = t2.process;
  t2.process = (input, field, emit, contribute) => {
    const out = process(input, field, emit, contribute);
    agency.push(out);
    return out;
  };
  const layers: Layers = {
    t1: createT1(),
    t2,
    t3: createT3({}),
    t4: createT4(),
    t5: createT5({ predict: rule }),
    t6: createT6(),
    t7: createT7(),
    t8: createT8(),
  };
  return createCycle({ layers, glob: createGlobMod({ appraisalGain: 1 }, 0), data, events, initialEmission: { action: "boot" } });
}

function moves(events: EventLog, id: string): string[] {
  return events
    .all()
    .filter((r): r is ProvenanceActivity => r.kind === "activity" && r.activityKind === "provenance" && r.datumId === id)
    .map((r) => `${r.from}→${r.to}@${r.cycleMark}`);
}

function exitsAt(events: EventLog, id: string, cycle: number): number[] {
  return events
    .all()
    .filter((r): r is LayerExitActivity => r.kind === "activity" && r.activityKind === "layer-exit" && r.datumId === id && r.cycleMark === cycle)
    .map((r) => r.layer);
}

function seal(events: EventLog, cycle: number): CycleSealActivity {
  return events.all().find((r): r is CycleSealActivity => r.kind === "activity" && r.activityKind === "cycle-seal" && r.activity.cycle === cycle)!;
}

test("a datum written anew enters at nascent, with the cycle that wrote it, and its tags in that cycle's record", () => {
  const data = createDataStore();
  const events = createEventLog();
  step(cycleOver(data, events, writingRule(new Map([[0, { payload: { code: "v1" }, open: MODEL_TAGS }]]), [])), 0);

  const d = data.get("written-0-0")!;
  assert.deepEqual(d.payload, { code: "v1" });
  assert.equal(d.fixed.provenance, "nascent");
  assert.equal(d.fixed.cycleMark, 0, "it bears the cycle that wrote it");
  assert.equal(d.fixed.floorTag, 5, "written at T5");
  assert.deepEqual(d.open, MODEL_TAGS);
  assert.deepEqual(moves(events, "written-0-0"), [], "an entry is not a move");
  assert.deepEqual(seal(events, 0).activity.written?.map((t) => t.datumId), ["written-0-0"]);
  assert.equal(JSON.stringify(seal(events, 0).activity.written).includes("v1"), false, "tags, never content");
});

test("the next cycle it arrives, T2 reads it as the agent's own, it runs every layer, and moves nascent → running", () => {
  const data = createDataStore();
  const events = createEventLog();
  const met: unknown[] = [];
  const agency: T2Output[] = [];
  const cycle = cycleOver(data, events, writingRule(new Map([[0, { payload: { code: "v1" }, open: MODEL_TAGS }]]), met), agency);
  step(cycle, 0);
  step(cycle, 1);

  assert.deepEqual(exitsAt(events, "written-0-0", 1), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(moves(events, "written-0-0"), ["nascent→running@1"]);
  const d = data.get("written-0-0")!;
  assert.equal(d.fixed.provenance, "running");
  assert.equal(d.fixed.cycleMark, 0, "running keeps the mark of the cycle that wrote it");
  assert.equal(d.fixed.floorTag, 8);
  const tagged = agency[1]!.tagged.find((t) => t.change.id === "written-0-0");
  assert.equal(tagged?.agency, "SELF_WRITTEN");
  assert.ok(met.some((c) => JSON.stringify(c).includes("v1")), "the rule met what it wrote");
});

test("a revision changes the content, not the provenance, and leaves a bare revision line", () => {
  const data = createDataStore();
  const events = createEventLog();
  const agency: T2Output[] = [];
  const plan = new Map<number, WriteRequest>([
    [0, { payload: { code: "v1" }, open: MODEL_TAGS }],
    [2, { datumId: "written-0-0", payload: { code: "v2" } }],
  ]);
  const cycle = cycleOver(data, events, writingRule(plan, []), agency);
  for (let t = 0; t < 4; t++) step(cycle, t);

  const d = data.get("written-0-0")!;
  assert.deepEqual(d.payload, { code: "v2" });
  assert.equal(d.fixed.provenance, "running", "the revision moved nothing");
  assert.deepEqual(d.open, MODEL_TAGS, "the tags stay when none are given");
  assert.deepEqual(moves(events, "written-0-0"), ["nascent→running@1"], "one entry, one first run, no move for the revision");
  const revisions = events.all().filter((r): r is RevisionActivity => r.kind === "activity" && r.activityKind === "revision");
  assert.deepEqual(
    revisions.map((r) => [r.datumId, r.cycleMark, r.issuingLayer]),
    [["written-0-0", 2, 5]],
  );
  assert.equal(JSON.stringify(revisions).includes("v2"), false, "no content in the log");
  assert.deepEqual(exitsAt(events, "written-0-0", 3), [1, 2, 3, 4, 5, 6, 7, 8], "it arrives again after the revision");
  assert.equal(agency[3]!.tagged.find((t) => t.change.id === "written-0-0")?.agency, "SELF_WRITTEN");
});

test("a datum written anew must carry its tags, and only a held datum can be revised", () => {
  const noTags = cycleOver(createDataStore(), createEventLog(), writingRule(new Map([[0, { payload: 1 }]]), []));
  assert.throws(() => step(noTags, 0), TaggingGateError);

  const verdict = cycleOver(
    createDataStore(),
    createEventLog(),
    writingRule(new Map([[0, { payload: 1, open: { domain: "x", kind: "y", quality: "good" } }]]), []),
  );
  assert.throws(() => step(verdict, 0), TaggingGateError);

  const unknown = cycleOver(createDataStore(), createEventLog(), writingRule(new Map([[0, { datumId: "nope", payload: 1 }]]), []));
  assert.throws(() => step(unknown, 0), /no datum "nope" to revise/);
});

test("a cue may ask by provenance: what collided", () => {
  const data = createDataStore();
  const open = { domain: "observation", kind: "frame", source: "ch" };
  data.put("a", admitArrival({ payload: 1, admittingLayer: 1, open }, 0, 0));
  data.put("b", { ...admitArrival({ payload: 2, admittingLayer: 1, open }, 0, 0), fixed: { timestamp: 0, cycleMark: 0, provenance: "scar", floorTag: 8 } });
  const ids = (cue: Record<string, string>) => answerQuery(data, cue, 1).map((s) => (s.raw_payload as { entity: string }).entity);
  assert.deepEqual(ids({ kind: "frame" }), ["a", "b"]);
  assert.deepEqual(ids({ kind: "frame", provenance: "scar" }), ["b"]);
  assert.deepEqual(ids({ provenance: "running" }), ["a"]);
});

test("a run that writes and revises leaves a trace the checker accepts, and the new records survive the sink", () => {
  const events = createEventLog();
  const plan = new Map<number, WriteRequest>([
    [0, { payload: { code: "v1" }, open: MODEL_TAGS }],
    [2, { datumId: "written-0-0", payload: { code: "v2" } }],
  ]);
  const cycle = cycleOver(createDataStore(), events, writingRule(plan, []));
  for (let t = 0; t < 4; t++) step(cycle, t, t % 2 ? "sun" : "rain");

  const report = checkConformance(events);
  assert.deepEqual(report.results.filter((r) => r.verdict === "fail").map((r) => `${r.id}: ${r.detail}`), []);
  const c3 = report.results.find((r) => r.id === "3")!;
  assert.ok(c3.claims.some((c) => c.claim.startsWith("every datum the agent wrote runs") && c.verdict === "pass"));
  for (const rec of events.all()) assert.deepEqual(deserializeEventRecord(serializeEventRecord(rec)), rec);
});

test("a datum with no recorded entry is caught, whether it runs or is revised", () => {
  const run = () => {
    const events = createEventLog();
    step(cycleOver(createDataStore(), events, writingRule(new Map(), [])), 0);
    return events;
  };
  const ran = run();
  ran.append(recordLayerExit("side-door", 0, 1, 1));
  const c6 = checkConformance(ran).results.find((r) => r.id === "6")!;
  assert.equal(c6.verdict, "fail");
  assert.match(c6.detail, /side-door/);

  const revised = run();
  revised.append(recordRevision("side-door", 0, 5, 1));
  assert.equal(checkConformance(revised).results.find((r) => r.id === "6")!.verdict, "fail");
});

test("what was written survives a snapshot: resumed, it still arrives", () => {
  const data = createDataStore();
  const events = createEventLog();
  const first = cycleOver(data, events, writingRule(new Map([[0, { payload: { code: "v1" }, open: MODEL_TAGS }]]), []));
  step(first, 0);

  const layers: Layers = {
    t1: createT1(), t2: createT2(), t3: createT3({}), t4: createT4(),
    t5: createT5(), t6: createT6(), t7: createT7(), t8: createT8(),
  };
  const resumed = createCycle({
    layers, glob: createGlobMod({ appraisalGain: 1 }, 1), data, events,
    initialEmission: { action: "boot" }, resume: first.snapshot(),
  });
  step(resumed, 1);
  assert.deepEqual(moves(events, "written-0-0"), ["nascent→running@1"]);
});
