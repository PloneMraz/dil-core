/**
 * Attention over situations (INV-7) — the field raises the fit floor.
 *
 * The second half of attention, and the safe half. The two obvious readings of
 * "gate expectation by confidence" are both unsafe, and two tests here state why
 * rather than leaving it to a comment:
 *
 *   - scaling `Expectation.confidence` would corrupt §13.4's accumulation
 *     signature, which the conformance checker reads as INV-5;
 *   - skipping an entity at T5 would leave its return's resistance
 *     unregistered, which is §8.2's pure Mode-A.
 *
 * So the floor sits where selection already lived: forward-building, under the
 * H_COUNT ceiling.
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
import { FIT_FLOOR, FIT_FLOOR_PARAM } from "../store/decisions.js";

function sig(entity: string, value: unknown) {
  return { source_id: "ch", raw_payload: { entity, value }, t: 1 };
}

function cycleWith(params: Record<string, number>) {
  const events = createEventLog();
  const cycle = createCycle({
    layers: {
      t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
      t5: createT5(), t6: createT6(), t7: createT7(), t8: createT8(),
    },
    glob: createGlobMod({ appraisalGain: 1, ...params }, 0),
    data: createDataStore(),
    events,
    initialEmission: { action: "boot" },
  });
  return { cycle, events };
}

function builtForward(events: EventLog): boolean {
  return events
    .all()
    .some(
      (r) =>
        r.kind === "activity" &&
        r.activityKind === "provenance" &&
        r.from === "running" &&
        r.to === "simulated",
    );
}

/** Run n cycles against a stable entity, so its confidence accrues. */
function runStable(cycle: ReturnType<typeof cycleWith>["cycle"], n: number) {
  for (let i = 0; i < n; i++) {
    cycle.run({ signals: [sig("weather", "rain")], changes: [] });
  }
}

test("the default floor is 0, which is the behaviour the loop always had", () => {
  assert.equal(FIT_FLOOR, 0);
  const { cycle, events } = cycleWith({});
  runStable(cycle, 3);
  assert.ok(builtForward(events), "any store support at all is material");
});

test("a raised floor keeps the loop from building on thin support", () => {
  // Confidence ramps over SUFFICIENT_RECURRENCE, so after two cycles it is well
  // under 1. A floor near the top refuses to build from that.
  const { cycle, events } = cycleWith({ [FIT_FLOOR_PARAM]: 0.99 });
  runStable(cycle, 2);
  assert.equal(builtForward(events), false, "fit did not clear the floor");
});

test("the same history under a lower floor does build forward", () => {
  // INV-7 again: same accrued data, different field, different behaviour.
  const { cycle, events } = cycleWith({ [FIT_FLOOR_PARAM]: 0 });
  runStable(cycle, 2);
  assert.ok(builtForward(events));
});

test("a raised floor is cleared once support has actually accrued", () => {
  // Attention narrows what is built from; it does not close it off for ever.
  const { cycle, events } = cycleWith({ [FIT_FLOOR_PARAM]: 0.5 });
  runStable(cycle, 6);
  assert.ok(builtForward(events), "confidence saturated and cleared the floor");
});

// ── what the floor does NOT do: the two lines it must not cross ──

test("a raised floor still forms every expectation and registers every mismatch", () => {
  // §8.2: a loop that lets returns go unregistered is pure Mode-A. The floor
  // selects what is BUILT FROM, never what is registered.
  const { cycle, events } = cycleWith({ [FIT_FLOOR_PARAM]: 0.99 });
  runStable(cycle, 2);
  const result = cycle.run({ signals: [sig("weather", "snow")], changes: [] });

  assert.equal(builtForward(events), false, "still below the floor");
  assert.ok(result.scars > 0, "and the mismatch was registered all the same");
  assert.ok(
    events.bySourceId("weather").length > 0,
    "sourced to the entity that resisted",
  );
});

test("a raised floor leaves the recorded confidence untouched", () => {
  // §13.4 reads the (recurrence, confidence) series as the accumulation
  // signature; the checker FAILS a run whose confidence does not rise while
  // recurrence climbs. If the field scaled confidence, attention would forge
  // that signature. It does not touch it.
  const high = cycleWith({ [FIT_FLOOR_PARAM]: 0.99 });
  const low = cycleWith({ [FIT_FLOOR_PARAM]: 0 });
  runStable(high.cycle, 4);
  runStable(low.cycle, 4);

  const series = (events: EventLog) =>
    events
      .all()
      .filter((r) => r.kind === "activity" && r.activityKind === "expectation")
      .map((r) => [(r as { recurrence: number }).recurrence, (r as { confidence: number }).confidence]);

  assert.deepEqual(series(high.events), series(low.events));
  // And it really is a rising ramp, not two flat lines that happen to match.
  const confs = series(high.events).map(([, c]) => c);
  assert.ok(Math.max(...confs) > Math.min(...confs), "confidence ramped");
});
