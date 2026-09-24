/**
 * Every record takes the clock at the moment it happens (§9: the `[event]` log
 * "records each transition as it occurs"; a datum's timestamp is set "when the
 * datum is first stamped").
 *
 * Before, one clock reading per cycle stamped every record and every datum in
 * it, so a cycle in which the thinking took minutes showed nothing of where they
 * went, and a datum written at the end of it bore the time the cycle began.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createCycle, type Layers } from "./cycle.js";
import { createGlobMod } from "./glob-mod.js";
import {
  createT1, createT2, createT3, createT4, createT5, createT6, createT7, createT8,
} from "./layers/index.js";
import { persistence, type PredictRule } from "./layers/t5.js";
import { createDataStore } from "../store/data-store.js";
import { createEventLog, type EventLog } from "../store/event-log.js";
import { deserializeEventRecord, serializeEventRecord } from "../store/event-sink.js";
import type { CycleSealActivity, LayerExitActivity, LogRecord } from "../store/resist-event.js";
import type { Signal } from "./types.js";

const THINKING = 1000;

function sig(value: unknown): Signal {
  return { source_id: "ch", raw_payload: { entity: "weather", value }, t: 0 };
}

/** A clock that ticks once per reading; the rule can make time pass. */
function ticking() {
  let t = 1_000_000;
  return { now: () => ++t, pass: (ms: number) => void (t += ms) };
}

function loop() {
  const clock = ticking();
  let wrote = false;
  // A rule that takes a while to think on the first cycle, and writes what it thought.
  const rule: PredictRule = (entityId, window, observed, contribute, ask, write) => {
    if (!wrote) {
      clock.pass(THINKING);
      write({ builtFrom: [], payload: { thought: 1 }, open: { domain: "world-model", kind: "program", source: "mind" } });
      wrote = true;
    }
    return persistence(entityId, window, observed, contribute, ask, write);
  };
  const layers: Layers = {
    t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
    t5: createT5({ predict: rule }), t6: createT6(), t7: createT7(), t8: createT8(),
  };
  const data = createDataStore();
  const events = createEventLog();
  const cycle = createCycle({
    layers, glob: createGlobMod({ appraisalGain: 1 }, 0), data, events,
    initialEmission: { action: "boot" }, now: clock.now,
  });
  return { cycle, data, events };
}

/** The time a record says it happened at. A seal is written as the cycle closes. */
function timeOf(r: LogRecord): number | undefined {
  if (r.kind === "manifest") return r.t;
  if (r.kind === "scar") return r.event.t;
  if (r.activityKind === "cycle-seal") return r.activity.closedAt;
  return r.t;
}

function exits(events: EventLog, datumId: string, cycle: number): LayerExitActivity[] {
  return events.all().filter(
    (r): r is LayerExitActivity => r.kind === "activity" && r.activityKind === "layer-exit" && r.datumId === datumId && r.cycleMark === cycle,
  );
}

test("each layer exit takes its own time, and the thinking shows between T4 and T5", () => {
  const { cycle, events } = loop();
  cycle.run({ signals: [sig("sun")], changes: [] });

  const times = exits(events, "cycle-0", 0).map((r) => r.t);
  assert.equal(times.length, 8);
  for (let i = 1; i < times.length; i++) assert.ok(times[i]! > times[i - 1]!, `T${i + 1} after T${i}`);
  assert.ok(times[4]! - times[3]! >= THINKING, "the time T5 took is where it was spent");
  assert.ok(times[3]! - times[0]! < THINKING, "and not before it");
});

test("a datum is stamped when it is stamped: the written one after the thinking, the cycle datum at the start", () => {
  const { cycle, data, events } = loop();
  cycle.run({ signals: [sig("sun")], changes: [] });

  const seal = events.all().find((r): r is CycleSealActivity => r.kind === "activity" && r.activityKind === "cycle-seal")!;
  const t5 = exits(events, "cycle-0", 0)[4]!.t;
  assert.equal(data.get("cycle-0")!.fixed.timestamp, seal.activity.t, "the cycle datum: when the cycle began");
  assert.ok(data.get("written-0-0")!.fixed.timestamp > t5, "the written datum: when it was written, after T5 thought");
  assert.ok(data.get("signal-0-0")!.fixed.timestamp >= seal.activity.t, "the return: when it arrived");
});

test("the seal carries when the cycle began and when it closed, and they bracket its records", () => {
  const { cycle, events } = loop();
  cycle.run({ signals: [sig("sun")], changes: [] });
  cycle.run({ signals: [sig("rain")], changes: [] });

  const seals = events.all().filter((r): r is CycleSealActivity => r.kind === "activity" && r.activityKind === "cycle-seal");
  for (const s of seals) {
    const inside = events.all().filter(
      (r) => r.kind === "activity" && r.activityKind !== "cycle-seal" && "cycleMark" in r && r.cycleMark === s.activity.cycle,
    );
    for (const r of inside) {
      const t = timeOf(r)!;
      assert.ok(t >= s.activity.t && t <= s.activity.closedAt!, `${r.kind}/${(r as { activityKind?: string }).activityKind} inside its cycle`);
    }
  }
  assert.ok(seals[0]!.activity.closedAt! - seals[0]!.activity.t >= THINKING, "how long the first cycle took");
});

test("read in log order, the times never run backwards", () => {
  const { cycle, events } = loop();
  for (const v of ["sun", "rain", "rain"]) cycle.run({ signals: [sig(v)], changes: [] });

  let last = -Infinity;
  for (const r of events.all()) {
    const t = timeOf(r);
    if (t === undefined) continue;
    assert.ok(t >= last, `a record at ${t} follows one at ${last}`);
    last = t;
  }
  for (const rec of events.all()) assert.deepEqual(deserializeEventRecord(serializeEventRecord(rec)), rec);
});
