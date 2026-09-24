/**
 * The store answering through the real driver — end to end.
 *
 * §9 defines three edges by which a scar returns: `scar → running`,
 * `scar → simulated`, `scar → projected`. None of them could ever fire, because
 * nothing in the loop read the store. This asserts the first one now does, and
 * that it fires against the RECALLED datum rather than the cycle's own.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createCycle, type Layers } from "./cycle.js";
import { createGlobMod } from "./glob-mod.js";
import { createT1 } from "./layers/t1.js";
import { createT2 } from "./layers/t2.js";
import { createT3 } from "./layers/t3.js";
import { createT4 } from "./layers/t4.js";
import { createT5 } from "./layers/t5.js";
import { createT6 } from "./layers/t6.js";
import { createT7 } from "./layers/t7.js";
import { createT8 } from "./layers/t8.js";
import { createDataStore, type DataStore } from "../store/data-store.js";
import { createEventLog } from "../store/event-log.js";
import { admitHostData } from "../store/tagging-gate.js";
import { toRunning, toScar } from "../store/data-store.js";
import { recordScar, type ContextAnchor, type ProvenanceActivity } from "../store/resist-event.js";
import { CONTEXT_ANCHOR_DEPTH } from "../store/decisions.js";
import { createLogRecollection, recollecting } from "./recollection.js";
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
 * kept with it, the scarred datum in `[data]` too, under `datumId` when the
 * record names one and `cycle-N` when it does not.
 */
function seededLog(outcome: string, data: DataStore = createDataStore(), datumId?: string) {
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
  data.put(datumId ?? `cycle-${SEEDED_AT_CYCLE}`, scar);
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

function cycleOver({ events, data }: { events: ReturnType<typeof createEventLog>; data: DataStore }) {
  const recollection = createLogRecollection(events, { key: situationKey });
  const layers: Layers = {
    t1: createT1(),
    t2: createT2(),
    t3: createT3(),
    t4: createT4(),
    t5: createT5({ predict: recollecting(recollection) }),
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
    recollection,
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
    `cycle-${SEEDED_AT_CYCLE}`,
    "the datum that moved is the recalled scar, not this cycle's datum",
  );
});

test("a recalled scar held by a region return moves on that datum, and only once", () => {
  const store = seededLog("rain", createDataStore(), "signal-7-0");
  const { events, data } = store;
  const cycle = cycleOver(store);
  // Cycle 0 recalls the seeded scar, and the region contradicts it: a new scar
  // on this cycle's return. Cycles 1 and 2 recall that newer scar, the most
  // recent record about the hall — which moves the first time only.
  for (let i = 0; i < 3; i++) cycle.run({ signals: [seen("hall", "sun")], changes: [] });

  const returns = provenance(events).filter((p) => p.from === "scar" && p.to === "running");
  assert.deepEqual(
    returns.map((p) => [p.datumId, p.cycleMark]),
    [["signal-7-0", 0], ["signal-0-0", 1]],
    "each recalled scar moves on the datum its record names, and once",
  );
  assert.equal(data.get("signal-7-0")!.fixed.provenance, "running", "[data] follows the log");
  assert.equal(data.get("signal-0-0")!.fixed.provenance, "running");
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

test("with no recollection declared the driver records no scar return", () => {
  const { events, data } = seededLog("rain");
  const layers: Layers = {
    t1: createT1(),
    t2: createT2(),
    t3: createT3(),
    t4: createT4(),
    t5: createT5(),
    t6: createT6(),
    t7: createT7(),
    t8: createT8(),
  };
  const cycle = createCycle({
    layers,
    glob: createGlobMod({ appraisalGain: 1 }, 0),
    data,
    events,
    initialEmission: { action: "boot" },
  });

  cycle.run({ signals: [seen("hall", "sun")], changes: [] });

  assert.equal(
    provenance(events).filter((p) => p.from === "scar").length,
    0,
    "the reference behaviour is unchanged when no channel is declared",
  );
});
