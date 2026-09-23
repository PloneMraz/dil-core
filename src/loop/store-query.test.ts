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
import { createT2 } from "./layers/t2.js";
import { createT3, STORE_CHANNEL, type ChannelTransducer } from "./layers/t3.js";
import { createT4 } from "./layers/t4.js";
import { createT5 } from "./layers/t5.js";
import { createT6 } from "./layers/t6.js";
import { createT7 } from "./layers/t7.js";
import { createT8 } from "./layers/t8.js";
import { answerQuery, matchesCue } from "./store-query.js";
import { createDataStore, type DataStore } from "../store/data-store.js";
import { createEventLog, type EventLog } from "../store/event-log.js";
import { admitHostData } from "../store/tagging-gate.js";
import type {
  CycleSealActivity,
  EmissionActivity,
  ProvenanceActivity,
} from "../store/resist-event.js";
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
