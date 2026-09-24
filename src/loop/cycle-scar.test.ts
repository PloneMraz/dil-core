/**
 * When the cycle datum itself goes to `scar` (§9; settled with Plone,
 * 2026-09-24).
 *
 * Since the region's return is a datum (276f30a), the return that collided is
 * the one that holds the scar. The cycle datum collides only when what it
 * carries does: an outcome it cast (`projected → scar`), or a collision with no
 * return of its own to hold the scar, such as an absence, for which it stands.
 * A cast that did not collide returns to use (`projected → running`), and with
 * no cast the cycle datum stays `running` when a return collides.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createCycle } from "./cycle.js";
import { createGlobMod } from "./glob-mod.js";
import {
  createT1, createT2, createT3, createT4, createT5, createT6, createT7, createT8,
} from "./layers/index.js";
import { createDataStore, type DataStore } from "../store/data-store.js";
import { createEventLog, type EventLog } from "../store/event-log.js";
import { FIT_FLOOR_PARAM } from "../store/decisions.js";
import type { EventRecord, ProvenanceActivity } from "../store/resist-event.js";
import type { Signal } from "./types.js";

function sig(entity: string, value: unknown): Signal {
  return { source_id: "ch", raw_payload: { entity, value }, t: 1 };
}

/** A loop whose field sets the fit floor a situation must clear to be cast from. */
function loop(fitFloor: number): { cycle: ReturnType<typeof createCycle>; data: DataStore; events: EventLog } {
  const data = createDataStore();
  const events = createEventLog();
  const cycle = createCycle({
    layers: {
      t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
      t5: createT5(), t6: createT6(), t7: createT7(), t8: createT8(),
    },
    glob: createGlobMod({ appraisalGain: 1, [FIT_FLOOR_PARAM]: fitFloor }, 0),
    data,
    events,
    initialEmission: { action: "boot" },
  });
  return { cycle, data, events };
}

function cycleMoves(events: EventLog, cycle: number): string[] {
  return events
    .all()
    .filter((r): r is ProvenanceActivity => r.kind === "activity" && r.activityKind === "provenance" && r.datumId === `cycle-${cycle}`)
    .map((r) => `${r.from}→${r.to}`);
}

function scarsAt(events: EventLog, cycle: number): EventRecord[] {
  return events.all().filter((r): r is EventRecord => r.kind === "scar" && r.anchor.cycle === cycle);
}

test("a cast outcome that collides: the cycle datum goes projected → scar", () => {
  const { cycle, data, events } = loop(0);
  cycle.run({ signals: [sig("a", 1)], changes: [] });
  cycle.run({ signals: [sig("a", 1)], changes: [] });
  cycle.run({ signals: [sig("a", 2)], changes: [] }); // `a` was cast, and it changed

  assert.deepEqual(cycleMoves(events, 2), ["running→simulated", "simulated→projected", "projected→scar"]);
  assert.equal(data.get("cycle-2")!.fixed.provenance, "scar");
  assert.equal(scarsAt(events, 2)[0]!.datumId, "signal-2-0", "the return holds the record");
});

test("a cast that did not collide returns to use, though another return collided", () => {
  // `a` is well supported and cast; `b` has been seen once, below the floor,
  // so no outcome was cast for it. `b` changes, `a` does not.
  const { cycle, data, events } = loop(0.5);
  for (let i = 0; i < 3; i++) cycle.run({ signals: [sig("a", 1)], changes: [] });
  cycle.run({ signals: [sig("a", 1), sig("b", 1)], changes: [] });
  cycle.run({ signals: [sig("a", 1), sig("b", 2)], changes: [] });

  assert.deepEqual(cycleMoves(events, 4), ["running→simulated", "simulated→projected", "projected→running"]);
  assert.equal(data.get("cycle-4")!.fixed.provenance, "running");
  assert.equal(data.get("signal-4-1")!.fixed.provenance, "scar", "`b`'s return holds the scar");
  assert.equal(data.get("signal-3-1")!.fixed.provenance, "scar", "and so does the return persistence expected (v0.3.5)");
  assert.equal(scarsAt(events, 4).length, 2);
});

test("with no cast, a return that collides leaves the cycle datum running", () => {
  const { cycle, data, events } = loop(2); // nothing clears a floor above full confidence
  cycle.run({ signals: [sig("a", 1)], changes: [] });
  cycle.run({ signals: [sig("a", 2)], changes: [] });

  assert.deepEqual(cycleMoves(events, 1), []);
  assert.equal(data.get("cycle-1")!.fixed.provenance, "running");
  assert.equal(data.get("signal-1-0")!.fixed.provenance, "scar");
  assert.equal(scarsAt(events, 1)[0]!.datumId, "signal-1-0");
});

test("an absence has no return to hold its scar, so the cycle datum stands for it", () => {
  const { cycle, data, events } = loop(2);
  cycle.run({ signals: [sig("a", 1)], changes: [] });
  const r = cycle.run({ signals: [], changes: [] }); // `a` falls silent
  assert.ok(r.absences >= 1);

  assert.deepEqual(cycleMoves(events, 1), ["running→scar"]);
  assert.equal(data.get("cycle-1")!.fixed.provenance, "scar");
  const [scar] = scarsAt(events, 1);
  assert.equal(scar!.event.mismatch_kind, "absence");
  assert.equal(scar!.datumId, undefined, "the record embeds the cycle datum, which the provenance line names");
});

test("nothing collides: a cast returns to use, and with no cast nothing moves", () => {
  const cast = loop(0);
  cast.cycle.run({ signals: [sig("a", 1)], changes: [] });
  cast.cycle.run({ signals: [sig("a", 1)], changes: [] });
  assert.deepEqual(cycleMoves(cast.events, 1), ["running→simulated", "simulated→projected", "projected→running"]);

  const bare = loop(2);
  bare.cycle.run({ signals: [sig("a", 1)], changes: [] });
  bare.cycle.run({ signals: [sig("a", 1)], changes: [] });
  assert.deepEqual(cycleMoves(bare.events, 1), []);
});
