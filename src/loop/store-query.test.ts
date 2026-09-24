/**
 * The character recalling from its own store — end to end through the driver.
 *
 * §6.4: "T3 emits a query: it opens or calls a channel to ingest actively." §9:
 * host data enters as `prior`, "once admitted and once it has run, bears a
 * cycle-mark". Before this, a `prior` was admitted and then nothing ever asked
 * for it, so it never ran. These tests pin the whole road: the cue, the query,
 * the return arriving at T1, the move to `running`, and that nothing floods.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createCycle, type Layers } from "./cycle.js";
import { createGlobMod } from "./glob-mod.js";
import { createT1 } from "./layers/t1.js";
import { createT2, type T2Output } from "./layers/t2.js";
import { createT3, STORE_CHANNEL, storeQuery, type ChannelTransducer } from "./layers/t3.js";
import { createT4 } from "./layers/t4.js";
import { createT5, persistence, type PredictRule } from "./layers/t5.js";
import { createT6 } from "./layers/t6.js";
import { createT7 } from "./layers/t7.js";
import { createT8 } from "./layers/t8.js";
import { answerQuery, matchesCue } from "./store-query.js";
import { createDataStore, type DataStore } from "../store/data-store.js";
import { createEventLog, type EventLog } from "../store/event-log.js";
import { admitHostData } from "../store/tagging-gate.js";
import {
  recordProvenance,
  type CycleSealActivity,
  type EmissionActivity,
  type LayerExitActivity,
  type ProvenanceActivity,
} from "../store/resist-event.js";
import { deserializeEventRecord, serializeEventRecord } from "../store/event-sink.js";
import { checkConformance } from "../conformance/checker.js";
import type { Signal } from "./types.js";

const DIRECTIVE = "prior:directive";
const UNRELATED = "prior:unrelated";

/** What the region reports each cycle: its own status, as one entity. */
function status(t: number): Signal {
  return { source_id: "status", raw_payload: { entity: "region", state: "playing" }, t };
}

/** The status channel's transducer describes what arrives on it (tag F). */
const describedStatus: ChannelTransducer = (s) => ({
  infoType: "status",
  value: s.raw_payload,
  describe: { object: "region-status" },
});

function seededStore(): DataStore {
  const data = createDataStore();
  data.put(
    DIRECTIVE,
    admitHostData(
      {
        payload: { says: "Your goal is to win." },
        admittingLayer: 1,
        open: { domain: "rules", kind: "directive", object: "region-status" },
      },
      1,
    ),
  );
  data.put(
    UNRELATED,
    admitHostData(
      {
        payload: { says: "Something about something else." },
        admittingLayer: 1,
        open: { domain: "rules", kind: "world", object: "things" },
      },
      1,
    ),
  );
  return data;
}

function cycleOver(
  data: DataStore,
  events: EventLog,
  transducers: Record<string, ChannelTransducer> = { status: describedStatus },
) {
  const layers: Layers = {
    t1: createT1(),
    t2: createT2(),
    t3: createT3(transducers),
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
  });
}

function queries(events: EventLog): EmissionActivity[] {
  return events
    .all()
    .filter(
      (r): r is EmissionActivity =>
        (r as EmissionActivity).activityKind === "emission" &&
        (r as EmissionActivity).issuingLayer === 3,
    );
}

function moves(events: EventLog, datumId: string): ProvenanceActivity[] {
  return events
    .all()
    .filter(
      (r): r is ProvenanceActivity =>
        (r as ProvenanceActivity).activityKind === "provenance" &&
        (r as ProvenanceActivity).datumId === datumId,
    );
}

function observedAt(events: EventLog, cycle: number): readonly string[] {
  const seal = events
    .all()
    .find(
      (r): r is CycleSealActivity =>
        (r as CycleSealActivity).activityKind === "cycle-seal" &&
        (r as CycleSealActivity).activity.cycle === cycle,
    );
  return (seal?.activity.observed as string[] | undefined) ?? [];
}

// ── the index is the open layer ──

test("a datum matches a cue when its open tags carry every pair of it", () => {
  const data = seededStore();
  assert.equal(matchesCue(data.get(DIRECTIVE)!, { object: "region-status" }), true);
  assert.equal(matchesCue(data.get(UNRELATED)!, { object: "region-status" }), false);
  assert.equal(matchesCue(data.get(DIRECTIVE)!, {}), false, "an empty cue asks for nothing");
});

test("the store answers on the store channel, with the datum as it held it", () => {
  const [ret, ...rest] = answerQuery(seededStore(), { object: "region-status" }, 5);
  assert.equal(rest.length, 0);
  assert.equal(ret!.source_id, STORE_CHANNEL);
  const p = ret!.raw_payload as { entity: string; fixed: { provenance: string } };
  assert.equal(p.entity, DIRECTIVE);
  assert.equal(p.fixed.provenance, "prior", "the return says the datum is not its own yet");
});

// ── the road through the driver ──

test("T3 asks the store about what arrived, and the query is traced to T3 (§6.4)", () => {
  const events = createEventLog();
  cycleOver(seededStore(), events).run({ signals: [status(1)], changes: [] });

  const q = queries(events);
  assert.equal(q.length, 1);
  assert.deepEqual(q[0]!.action, {
    kind: "query",
    channel: STORE_CHANNEL,
    cue: { object: "region-status" },
  });
});

test("nothing is recalled in the cycle that asks: the return arrives at T1 next cycle", () => {
  const data = seededStore();
  const events = createEventLog();
  const cycle = cycleOver(data, events);

  cycle.run({ signals: [status(1)], changes: [] });
  assert.equal(moves(events, DIRECTIVE).length, 0);
  assert.equal(data.get(DIRECTIVE)!.fixed.provenance, "prior");
  assert.ok(!observedAt(events, 0).includes(DIRECTIVE));

  cycle.run({ signals: [status(2)], changes: [] });
  assert.ok(observedAt(events, 1).includes(DIRECTIVE), "it ran the layers up to T5");
});

test("a recalled prior moves to running and takes the cycle it ran in (§9)", () => {
  const data = seededStore();
  const events = createEventLog();
  const cycle = cycleOver(data, events);
  cycle.run({ signals: [status(1)], changes: [] });
  cycle.run({ signals: [status(2)], changes: [] });

  const m = moves(events, DIRECTIVE);
  assert.equal(m.length, 1);
  assert.equal(m[0]!.from, "prior");
  assert.equal(m[0]!.to, "running");
  assert.equal(m[0]!.cycleMark, 1);
  assert.equal(data.get(DIRECTIVE)!.fixed.provenance, "running");
  assert.equal(data.get(DIRECTIVE)!.fixed.cycleMark, 1);
});

test("memory is recalled on a cue, never poured in", () => {
  const data = seededStore();
  const events = createEventLog();
  const cycle = cycleOver(data, events);
  for (let t = 1; t <= 5; t++) cycle.run({ signals: [status(t)], changes: [] });

  assert.equal(queries(events).length, 1, "a cue already asked about is not asked again");
  assert.equal(moves(events, UNRELATED).length, 0, "what no cue matched stays where it is");
  assert.equal(data.get(UNRELATED)!.fixed.provenance, "prior");
  const recalled = [0, 1, 2, 3, 4].filter((c) => observedAt(events, c).includes(DIRECTIVE));
  assert.deepEqual(recalled, [1], "recalled once, on the cycle after it was asked for");
});

test("a return is present only on the cycle it arrives: no absence when it is not asked", () => {
  const data = seededStore();
  const events = createEventLog();
  const cycle = cycleOver(data, events);
  const present = new Set(["region"]);
  cycle.run({ signals: [status(1)], changes: [], present });
  cycle.run({ signals: [status(2)], changes: [], present });
  const after = cycle.run({ signals: [status(3)], changes: [], present });
  assert.equal(after.absences, 0);
});

test("a memory that was not recalled is not silent, even when the host reports no presence", () => {
  // MEASURED before the fix: with no presence reported, T7 expected the recalled
  // directive back every cycle and registered it absent from cycle 2 on — one
  // false absence per cycle, for ever.
  const data = seededStore();
  const events = createEventLog();
  const cycle = cycleOver(data, events);
  const absences: number[] = [];
  for (let t = 1; t <= 6; t++) absences.push(cycle.run({ signals: [status(t)], changes: [] }).absences);
  assert.deepEqual(absences, [0, 0, 0, 0, 0, 0]);
});

test("with no description of the arrival there is nothing to ask with, and T3 does not ask", () => {
  const events = createEventLog();
  const cycle = cycleOver(seededStore(), events, {});
  cycle.run({ signals: [status(1)], changes: [] });
  cycle.run({ signals: [status(2)], changes: [] });
  assert.equal(queries(events).length, 0);
});

test("what T3 has asked, and what is still in flight, survive a snapshot", () => {
  const data = seededStore();
  const events = createEventLog();
  const t3 = createT3({ status: describedStatus });
  const layers: Layers = {
    t1: createT1(), t2: createT2(), t3, t4: createT4(), t5: createT5(),
    t6: createT6(), t7: createT7(), t8: createT8(),
  };
  const glob = createGlobMod({ appraisalGain: 1 }, 0);
  const first = createCycle({ layers, glob, data, events, initialEmission: { action: "boot" } });
  first.run({ signals: [status(1)], changes: [] });
  const state = first.snapshot();
  assert.equal(state.pendingReturns?.length, 1);

  const resumed = createCycle({
    layers, glob, data, events, initialEmission: { action: "boot" }, resume: state,
  });
  resumed.run({ signals: [status(2)], changes: [] });
  assert.equal(moves(events, DIRECTIVE).length, 1, "the answer in flight still arrived");
  assert.deepEqual(t3.snapshot(), { asked: [JSON.stringify([["object", "region-status"]])] });
});

// ── agency closure (§6.4 rule 3) ──

test("what a query brought back is matched to the query and tagged SELF_WRITTEN (§6.4, INV-6)", () => {
  // "emit → region returns → T1 ingests → T2 matches." The return is a change
  // the agent's own query produced; T2 must be able to read that query as an
  // action just emitted, or it could only call the return ENV_PUSHED.
  const data = seededStore();
  const events = createEventLog();
  const inner = createT2({ stabilityThreshold: 1 });
  const seen: T2Output[] = [];
  const t2: Layers["t2"] = {
    ...inner,
    process(input, field, emit, contribute) {
      const out = inner.process(input, field, emit, contribute);
      seen.push(out);
      return out;
    },
  };
  const layers: Layers = {
    t1: createT1(), t2, t3: createT3({ status: describedStatus }), t4: createT4(),
    t5: createT5(), t6: createT6(), t7: createT7(), t8: createT8(),
  };
  const cycle = createCycle({
    layers, glob: createGlobMod({ appraisalGain: 1 }, 0), data, events,
    initialEmission: { action: "boot" },
  });
  cycle.run({ signals: [status(1)], changes: [] });
  cycle.run({ signals: [status(2)], changes: [] });

  const recalled = seen[1]!.tagged.find((t) => t.change.id === DIRECTIVE);
  assert.ok(recalled, "the return is an observed change");
  assert.equal(recalled!.agency, "SELF_WRITTEN");
});

// ── one arrival, several things it is about ──

test("an arrival about several things asks about each, and each is recalled", () => {
  const data = seededStore();
  const events = createEventLog();
  const both: ChannelTransducer = (s) => ({
    infoType: "status",
    value: s.raw_payload,
    describe: [{ object: "region-status" }, { object: "things" }],
  });
  const cycle = cycleOver(data, events, { status: both });
  cycle.run({ signals: [status(1)], changes: [] });
  cycle.run({ signals: [status(2)], changes: [] });
  assert.equal(queries(events).length, 2);
  assert.equal(data.get(DIRECTIVE)!.fixed.provenance, "running");
  assert.equal(data.get(UNRELATED)!.fixed.provenance, "running");
});

// ── the recalled datum's own trace (§9, §13.6) ──

function sealOf(events: EventLog, cycle: number): CycleSealActivity {
  return events
    .all()
    .find(
      (r): r is CycleSealActivity =>
        (r as CycleSealActivity).activityKind === "cycle-seal" &&
        (r as CycleSealActivity).activity.cycle === cycle,
    )!;
}

test("a recalled datum's own path is in the log: it exits T1..T8 in the cycle it runs (§9)", () => {
  const data = seededStore();
  const events = createEventLog();
  const cycle = cycleOver(data, events);
  cycle.run({ signals: [status(1)], changes: [] });
  cycle.run({ signals: [status(2)], changes: [] });
  const exits = events
    .all()
    .filter(
      (r): r is LayerExitActivity =>
        (r as LayerExitActivity).activityKind === "layer-exit" &&
        (r as LayerExitActivity).datumId === DIRECTIVE,
    );
  assert.deepEqual(exits.map((e) => [e.cycleMark, e.layer]), [1, 2, 3, 4, 5, 6, 7, 8].map((l) => [1, l]));
  assert.equal(data.get(DIRECTIVE)!.fixed.floorTag, 8, "its floor-tag names the layer it just exited");
});

test("the activity record carries a recalled datum's tag set, and never its content", () => {
  const data = seededStore();
  const events = createEventLog();
  const cycle = cycleOver(data, events);
  cycle.run({ signals: [status(1)], changes: [] });
  cycle.run({ signals: [status(2)], changes: [] });
  const recalled = sealOf(events, 1).activity.recalled;
  assert.equal(recalled?.length, 1);
  assert.equal(recalled![0]!.datumId, DIRECTIVE);
  assert.deepEqual(recalled![0]!.open, { domain: "rules", kind: "directive", object: "region-status" });
  assert.equal(recalled![0]!.fixed.provenance, "running");
  assert.equal(recalled![0]!.fixed.cycleMark, 1);
  assert.equal(JSON.stringify(sealOf(events, 1)).includes("Your goal is to win"), false,
    "uncontested content stays out of the agent's memory (§9)");
  assert.equal("recalled" in sealOf(events, 0).activity, false,
    "a cycle that recalled nothing writes the record exactly as before");
});

test("the recalled tag set survives the durable form", () => {
  const data = seededStore();
  const events = createEventLog();
  const cycle = cycleOver(data, events);
  cycle.run({ signals: [status(1)], changes: [] });
  cycle.run({ signals: [status(2)], changes: [] });
  const seal = sealOf(events, 1);
  const back = deserializeEventRecord(JSON.parse(JSON.stringify(serializeEventRecord(seal)))) as CycleSealActivity;
  assert.deepEqual(back.activity.recalled, seal.activity.recalled);
});

test("the checker reads the recalled path and the gate from the trace (§13.3, §13.6)", () => {
  const data = seededStore();
  const events = createEventLog();
  const cycle = cycleOver(data, events);
  for (let t = 1; t <= 4; t++) cycle.run({ signals: [status(t)], changes: [] });
  const report = checkConformance(events);
  const c3 = report.results.find((r) => r.id === "3")!;
  const c6 = report.results.find((r) => r.id === "6")!;
  assert.ok(c3.claims.some((c) => c.claim.startsWith("every recalled datum's path") && c.verdict === "pass"));
  assert.ok(c6.claims.some((c) => c.claim.startsWith("host data entered only via the tagging-gate") && c.verdict === "pass"));
});

test("a datum that ran from prior with no tag set in the trace is caught (§13.6)", () => {
  const data = seededStore();
  const events = createEventLog();
  const cycle = cycleOver(data, events);
  cycle.run({ signals: [status(1)], changes: [] });
  // A datum appears in the trace leaving `prior`, but no activity record shows
  // its tags: it came in by a door the log cannot see.
  events.append(recordProvenance("side-door", 0, "prior", "running", 1));
  const c6 = checkConformance(events).results.find((r) => r.id === "6")!;
  assert.equal(c6.verdict, "fail");
  assert.match(c6.detail, /side-door/);
});

// ── the rule asks: thinking chooses what to read (§6.4) ──

/** A cycle whose T3 describes nothing, so any query is the rule's own. */
function cycleWithRule(data: DataStore, events: EventLog, predict: PredictRule) {
  const layers: Layers = {
    t1: createT1(),
    t2: createT2(),
    t3: createT3({}),
    t4: createT4(),
    t5: createT5({ predict }),
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
  });
}

/** Asks about the world once, the first time it meets anything; records what it met. */
function askingRule(met: unknown[]): PredictRule {
  let asked = false;
  return (entityId, window, observed, contribute, ask) => {
    met.push(observed.content);
    if (!asked) {
      asked = true;
      ask({ kind: "world" });
    }
    return persistence(entityId, window, observed, contribute, ask);
  };
}

function emissionsFrom(events: EventLog, layer: number): EmissionActivity[] {
  return events
    .all()
    .filter(
      (r): r is EmissionActivity =>
        (r as EmissionActivity).activityKind === "emission" &&
        (r as EmissionActivity).issuingLayer === layer,
    );
}

test("the rule asks the store, and the query is traced to T5 with register ↔ (§6.4)", () => {
  const events = createEventLog();
  cycleWithRule(seededStore(), events, askingRule([])).run({ signals: [status(1)], changes: [] });

  assert.equal(queries(events).length, 0, "T3 described nothing, so it asked nothing");
  const q = emissionsFrom(events, 5);
  assert.equal(q.length, 1);
  assert.deepEqual(q[0]!.action, storeQuery({ kind: "world" }));
  assert.equal(q[0]!.register, "↔");
});

test("what the rule asked for arrives at T1 next cycle and reaches the rule; nothing else is recalled", () => {
  const data = seededStore();
  const events = createEventLog();
  const met: unknown[] = [];
  const cycle = cycleWithRule(data, events, askingRule(met));

  cycle.run({ signals: [status(1)], changes: [] });
  assert.equal(data.get(UNRELATED)!.fixed.provenance, "prior", "nothing arrives in the cycle that asks");

  cycle.run({ signals: [status(2)], changes: [] });
  assert.ok(observedAt(events, 1).includes(UNRELATED), "the answer ran the layers up to T5");
  assert.ok(
    met.some((c) => JSON.stringify(c).includes("Something about something else.")),
    "the rule met what it asked for",
  );
  assert.equal(data.get(UNRELATED)!.fixed.provenance, "running");
  assert.equal(data.get(DIRECTIVE)!.fixed.provenance, "prior", "what was not asked for stays where it was");
  assert.ok(!observedAt(events, 1).includes(DIRECTIVE));
});

test("a rule that asks leaves a trace the checker accepts", () => {
  const events = createEventLog();
  const cycle = cycleWithRule(seededStore(), events, askingRule([]));
  for (let t = 1; t <= 3; t++) cycle.run({ signals: [status(t)], changes: [] });

  const failed = checkConformance(events).results.filter((r) => r.verdict === "fail");
  assert.deepEqual(failed.map((r) => `${r.id}: ${r.detail}`), []);
});
