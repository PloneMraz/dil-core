/**
 * The record read through the real driver — end to end (v0.3.9).
 *
 * The record's view is an open link: every cycle hands it to the rule, with no
 * declaration and no switch. Recollection, one law over it, recalls a scar as an
 * expectation held by the datum that collided; used again, that datum returns
 * to `running` (§9 `scar → running`) — the RECALLED datum, not the cycle's own.
 * Every read is recorded, by its place in the chain, and what was read can be
 * named among what a written datum was built from.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createCycle, type Layers } from "./cycle.js";
import { createGlobMod } from "./glob-mod.js";
import { createT1 } from "./layers/t1.js";
import { createT2 } from "./layers/t2.js";
import { createT3 } from "./layers/t3.js";
import { createT4 } from "./layers/t4.js";
import { createT5, persistence, type PredictRule, type RecordView } from "./layers/t5.js";
import { createT6 } from "./layers/t6.js";
import { createT7 } from "./layers/t7.js";
import { createT8 } from "./layers/t8.js";
import { createDataStore, type DataStore } from "../store/data-store.js";
import { createEventLog } from "../store/event-log.js";
import { admitHostData } from "../store/tagging-gate.js";
import { toRunning, toScar } from "../store/data-store.js";
import { recordScar, type ContextAnchor, type CycleSealActivity, type ProvenanceActivity, type ReadRecordActivity } from "../store/resist-event.js";
import { CONTEXT_ANCHOR_DEPTH } from "../store/decisions.js";
import { recollecting } from "./recollection.js";
import { checkConformance } from "../conformance/checker.js";
import type { InfoUnit, Signal } from "./types.js";

const TS_AT = Date.UTC(2026, 5, 30);
const SEEDED_AT_CYCLE = 7;

/** The signal a host sends: an entity, and where it is. */
function seen(where: string, outcome: string, t = 1): Signal {
  return { source_id: "ch", raw_payload: { entity: "weather", value: { where, outcome } }, t };
}

/** The InfoUnit content T3 then T4 produce from that signal. */
function content(where: string, outcome: string) {
  return { infoType: "raw", channel: "ch", value: { entity: "weather", value: { where, outcome } } };
}

/** Keys on WHERE the observation is, so a record answers about this situation. */
const situationKey = (u: InfoUnit): string => {
  const c = u.content as { value?: { value?: { where?: unknown } } };
  return String(c?.value?.value?.where ?? "");
};

/**
 * A store as a past run left it: the scar in `[event]` and, since `[data]` is
 * kept with it, the scarred datum in `[data]` too, under the id its record names
 * — the region's return that collided.
 */
function seededLog(outcome: string, data: DataStore = createDataStore(), datumId = `signal-${SEEDED_AT_CYCLE}-0`) {
  const events = createEventLog();
  let d = admitHostData(
    { payload: "cycle", admittingLayer: 1, open: { domain: "weather", phase: "loop", source: "region" } },
    TS_AT,
  );
  d = toRunning(d, SEEDED_AT_CYCLE);
  const anchor: ContextAnchor = {
    depth: CONTEXT_ANCHOR_DEPTH,
    cycle: SEEDED_AT_CYCLE,
    fieldState: {},
  };
  const scar = toScar(d, true);
  data.put(datumId, scar);
  events.append(
    recordScar(
      scar,
      {
        source_id: "weather",
        expected: null,
        received: content("hall", outcome),
        mismatch_kind: "value-mismatch",
        t: 1,
      },
      anchor,
      datumId,
    ),
  );
  return { events, data };
}

function cycleOver(
  { events, data }: { events: ReturnType<typeof createEventLog>; data: DataStore },
  predict: PredictRule = recollecting(persistence, { key: situationKey }),
) {
  const layers: Layers = {
    t1: createT1(),
    t2: createT2(),
    t3: createT3(),
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

function provenance(events: ReturnType<typeof createEventLog>): ProvenanceActivity[] {
  return events
    .all()
    .filter(
      (r): r is ProvenanceActivity =>
        (r as ProvenanceActivity).activityKind === "provenance",
    );
}

test("a recalled scar returns as data in use, recorded as scar → running (§9)", () => {
  const store = seededLog("rain");
  const { events } = store;
  const cycle = cycleOver(store);

  cycle.run({ signals: [seen("hall", "sun")], changes: [] });

  const returns = provenance(events).filter((p) => p.from === "scar" && p.to === "running");
  assert.equal(returns.length, 1, "the recalled scar returned exactly once");
  assert.equal(
    returns[0]!.datumId,
    `signal-${SEEDED_AT_CYCLE}-0`,
    "the datum that moved is the recalled scar, not this cycle's datum",
  );
});

test("a recalled scar moves on the datum its record names, and [data] follows the log", () => {
  const store = seededLog("rain");
  const { events, data } = store;
  const cycle = cycleOver(store);
  // Cycle 0 recalls the seeded scar, and the region contradicts it: the return
  // and the recalled datum are scarred. Later cycles recall the newest record
  // about the hall, and each datum held moves back to `running` once a cycle.
  for (let i = 0; i < 3; i++) cycle.run({ signals: [seen("hall", "sun")], changes: [] });

  const moves = provenance(events);
  const returns = moves.filter((p) => p.from === "scar" && p.to === "running");
  assert.equal(returns[0]!.datumId, `signal-${SEEDED_AT_CYCLE}-0`);
  assert.equal(returns[0]!.cycleMark, 0);
  const perCycle = new Set(returns.map((p) => `${p.cycleMark}:${p.datumId}`));
  assert.equal(perCycle.size, returns.length, "a datum moves at most once a cycle");
  for (const id of new Set(returns.map((p) => p.datumId))) {
    const last = moves.filter((p) => p.datumId === id).at(-1)!;
    assert.equal(data.get(id)!.fixed.provenance, last.to, `[data] follows the log for ${id}`);
  }
});

test("the record supplies the expectation, and the region contradicting it makes a new scar", () => {
  const store = seededLog("rain");
  const { events } = store;
  const before = events.size();
  const cycle = cycleOver(store);

  // The record says `rain` here. The region says `sun`.
  const result = cycle.run({ signals: [seen("hall", "sun")], changes: [] });

  assert.equal(result.scars > 0, true, "the region contradicted the record");
  assert.ok(events.size() > before);
  assert.ok(
    events.bySourceId("weather").length >= 2,
    "the new collision is sourced to the entity that resisted",
  );
});

test("the region agreeing with the record leaves no new scar", () => {
  const cycle = cycleOver(seededLog("rain"));

  const result = cycle.run({ signals: [seen("hall", "rain")], changes: [] });

  assert.equal(result.scars, 0, "expectation met: nothing to record as experience");
});

test("a situation the record has never met leaves scar → running unfired", () => {
  const store = seededLog("rain");
  const { events } = store;
  const cycle = cycleOver(store);

  cycle.run({ signals: [seen("cellar", "sun")], changes: [] });

  const returns = provenance(events).filter((p) => p.from === "scar" && p.to === "running");
  assert.equal(returns.length, 0, "nothing was recalled, so nothing returned");
});

test("a rule that does not read the record recalls nothing", () => {
  const { events, data } = seededLog("rain");
  const cycle = cycleOver({ events, data }, persistence);

  cycle.run({ signals: [seen("hall", "sun")], changes: [] });

  assert.equal(provenance(events).filter((p) => p.from === "scar").length, 0, "the reference behaviour is unchanged");
  assert.equal(events.all().filter((r) => r.kind === "activity" && r.activityKind === "read-record").length, 0);
});

// ── the link is open ──

test("every cycle hands the rule the record's view, with nothing declared", () => {
  const seen0: (RecordView | undefined)[] = [];
  const watching: PredictRule = (id, window, observed, contribute, ask, write, _test, _field, _read, record) => {
    seen0.push(record);
    return persistence(id, window, observed, contribute, ask, write);
  };
  const cycle = cycleOver(seededLog("rain"), watching);
  for (let i = 0; i < 3; i++) cycle.run({ signals: [seen("hall", "sun")], changes: [] });
  assert.ok(seen0.length >= 3 && seen0.every((v) => v !== undefined), "open in every cycle");
});

test("the view holds what the log held before the cycle; each read is recorded by seq", () => {
  const store = seededLog("rain");
  const { events } = store;
  const got: number[][] = [];
  const sizes: number[] = [];
  const reading: PredictRule = (id, window, observed, contribute, ask, write, _test, _field, _read, record) => {
    got.push(record!.recent("look", 5).map((r) => r.seq));
    return persistence(id, window, observed, contribute, ask, write);
  };
  const cycle = cycleOver(store, reading);
  for (let i = 0; i < 2; i++) {
    sizes.push(events.size());
    cycle.run({ signals: [seen("hall", "sun")], changes: [] });
  }
  got.forEach((seqs, i) => {
    assert.ok(seqs.length > 0 && seqs.every((s) => s < sizes[i]!), "nothing of the cycle that reads");
    assert.deepEqual(seqs, [...seqs].sort((a, b) => b - a), "newest first");
  });
  const lines = events.all().filter((r): r is ReadRecordActivity => r.kind === "activity" && r.activityKind === "read-record");
  assert.deepEqual(lines.map((l) => [l.cycleMark, l.purpose, l.records]), got.map((g, i) => [i, "look", g]));
});

test("a record read can be named among what a written datum was built from", () => {
  const store = seededLog("rain");
  const { events } = store;
  const writing: PredictRule = (id, window, observed, contribute, ask, write, _test, _field, _read, record) => {
    const [scar] = record!.scars("weather", "learn", 1);
    if (scar) write({ payload: "what the record says", open: { domain: "mind", kind: "note", source: "test" }, builtFrom: [`event:${scar.seq}`] });
    return persistence(id, window, observed, contribute, ask, write);
  };
  const cycle = cycleOver(store, writing);
  for (let i = 0; i < 3; i++) cycle.run({ signals: [seen("hall", "sun")], changes: [] });
  const seal = events.all().find((r): r is CycleSealActivity => r.kind === "activity" && r.activityKind === "cycle-seal")!;
  assert.deepEqual(seal.activity.written?.map((w) => w.builtFrom), [["event:0"]]);
  const c6 = checkConformance(events).results.find((r) => r.id === "6")!;
  assert.equal(c6.verdict, "pass", c6.detail);
});

test("a record the log did not hold before the cycle cannot be built from", () => {
  const store = seededLog("rain");
  const writing: PredictRule = (id, window, observed, contribute, ask, write) => {
    write({ payload: "x", open: { domain: "mind", kind: "note", source: "test" }, builtFrom: ["event:99999"] });
    return persistence(id, window, observed, contribute, ask, write);
  };
  assert.throws(() => cycleOver(store, writing).run({ signals: [seen("hall", "sun")], changes: [] }), /did not hold before this cycle/);
});
