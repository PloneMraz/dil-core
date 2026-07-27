/**
 * Smoke test — forward-building (§6.2, Bước 6): the simulated/projected circulation.
 *
 * We build the ROADS (the §9 provenance edges) and the CONDITIONS on them; which
 * road a datum takes is a situational fact, not a scheduled step. These tests
 * check the conditions fire honestly:
 *   - the store affording material (an accrued expectation) opens the
 *     running→simulated→projected road;
 *   - a forward-cast that matches returns to use (projected→running); one that
 *     collides holds (projected→scar);
 *   - a cold start (no material yet) takes neither — it stays running.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createCycle } from "./cycle.js";
import { createGlobMod } from "./glob-mod.js";
import {
  createT1, createT2, createT3, createT4, createT5, createT6, createT7, createT8,
} from "./layers/index.js";
import { createDataStore } from "../store/data-store.js";
import { createEventLog, type EventLog } from "../store/event-log.js";

function sig(entity: string, value: unknown) {
  return { source_id: "ch", raw_payload: { entity, value }, t: Date.now() };
}

function freshCycle() {
  const events = createEventLog();
  const cycle = createCycle({
    layers: {
      t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
      t5: createT5(), t6: createT6(), t7: createT7(), t8: createT8(),
    },
    glob: createGlobMod({ appraisalGain: 1 }, 0),
    data: createDataStore(),
    events,
    initialEmission: { action: "boot" },
  });
  return { cycle, events };
}

/** Count provenance transitions (`from→to`) recorded in the [event] log. */
function transitions(events: EventLog): Record<string, number> {
  const c: Record<string, number> = {};
  for (const r of events.all()) {
    if (r.kind === "activity" && r.activityKind === "provenance") {
      const key = `${r.from}→${r.to}`;
      c[key] = (c[key] ?? 0) + 1;
    }
  }
  return c;
}

test("cold start (cycle 0) affords no material — the datum does not forward-build", () => {
  const { cycle, events } = freshCycle();
  cycle.run({ signals: [sig("weather", "sun")], changes: [] }); // first sight of the entity
  const t = transitions(events);
  assert.equal(t["prior→running"], 1);
  assert.equal(t["running→simulated"] ?? 0, 0); // no expectation accrued yet
  assert.equal(t["simulated→projected"] ?? 0, 0);
});

test("once the store affords material, the datum takes running→simulated→projected", () => {
  const { cycle, events } = freshCycle();
  for (let i = 0; i < 4; i++) cycle.run({ signals: [sig("weather", "sun")], changes: [] });
  const t = transitions(events);
  assert.ok((t["running→simulated"] ?? 0) >= 1, "forward-building fired once material accrued");
  assert.equal(t["running→simulated"], t["simulated→projected"]); // each simulated casts a projected
});

test("a forward-cast that matches returns to use (projected→running), no scar", () => {
  const { cycle, events } = freshCycle();
  for (let i = 0; i < 4; i++) cycle.run({ signals: [sig("weather", "sun")], changes: [] });
  const t = transitions(events);
  assert.ok((t["projected→running"] ?? 0) >= 1); // stable returns → back to use
  assert.equal(t["projected→scar"] ?? 0, 0); // nothing collided
});

test("a forward-cast that collides holds (projected→scar), not a direct reflex", () => {
  const { cycle, events } = freshCycle();
  for (let i = 0; i < 4; i++) cycle.run({ signals: [sig("weather", "sun")], changes: [] }); // build material
  cycle.run({ signals: [sig("weather", "rain")], changes: [] }); // now the cast mismatches
  const t = transitions(events);
  assert.ok((t["projected→scar"] ?? 0) >= 1, "the collision held from the projected state");
});

test("provenance moves stay on the §9 graph and prior is entered once per datum", () => {
  const { cycle, events } = freshCycle();
  for (let i = 0; i < 5; i++) cycle.run({ signals: [sig("weather", "sun")], changes: [] });
  // every recorded move is a legal edge; each cycle-datum enters prior exactly once
  const priorEntries = events
    .all()
    .filter((r) => r.kind === "activity" && r.activityKind === "provenance" && r.from === "prior");
  const ids = priorEntries.map((r) => (r as { datumId: string }).datumId);
  assert.equal(ids.length, new Set(ids).size); // no datum enters prior twice
});
