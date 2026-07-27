/**
 * Smoke test — Stage 4e, the cycle driver (protocol §6).
 *
 * The fixed checks for stage 4: a datum traverses T1→T8 leaving a floor-tag at
 * each layer; cycle-0 is single-threaded; a collision is recorded as a scar in
 * the [event] log. Plus: the appraisal step runs under the field context (INV-8),
 * the response feeds back as the next emission (INV-1), and GLOB-MOD advances to
 * N+1.
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
import { createDataStore } from "../store/data-store.js";
import { createEventLog } from "../store/event-log.js";
import type { Signal } from "./types.js";

function freshLayers(): Layers {
  return {
    t1: createT1(),
    t2: createT2(),
    t3: createT3(),
    t4: createT4(),
    t5: createT5(),
    t6: createT6(),
    t7: createT7(),
    t8: createT8(),
  };
}

function freshCycle() {
  const data = createDataStore();
  const events = createEventLog();
  const glob = createGlobMod({ appraisalGain: 1 }, 0);
  const cycle = createCycle({
    layers: freshLayers(),
    glob,
    data,
    events,
    initialEmission: { action: "boot" },
  });
  return { cycle, data, events, glob };
}

// A signal whose entity is "weather", carrying a value.
function weather(value: unknown, t = 1): Signal {
  return { source_id: "ch", raw_payload: { entity: "weather", value }, t };
}

test("a cycle datum traverses T1→T8, stamping a floor-tag; the path lives in [event]", () => {
  const { cycle, data, events } = freshCycle();
  cycle.run({ signals: [weather("sun")], changes: [] });
  const datum = data.get("cycle-0")!;
  assert.equal(datum.fixed.floorTag, 8); // ended at T8 (the tag names the present only)
  // the path is read from the [event] layer-exit lines, never from a tag (§9)
  const layers: number[] = [];
  for (const r of events.all()) {
    if (r.kind === "activity" && r.activityKind === "layer-exit" && r.datumId === "cycle-0") {
      layers.push(r.layer);
    }
  }
  assert.deepEqual(layers, [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("cycle-0 runs and advances the cycle counter (single-threaded pass)", () => {
  const { cycle } = freshCycle();
  const r0 = cycle.run({ signals: [weather("sun")], changes: [] });
  assert.equal(r0.cycle, 0);
  assert.equal(cycle.cycleCount(), 1);
});

test("cycle-0 records the self/environment crystallization exactly once (§7)", () => {
  const { cycle, events } = freshCycle();
  cycle.run({ signals: [weather("sun")], changes: [] }); // cycle-0
  cycle.run({ signals: [weather("sun")], changes: [] }); // cycle-1
  cycle.run({ signals: [weather("sun")], changes: [] }); // cycle-2
  const cryst = events
    .all()
    .filter((r) => r.kind === "activity" && r.activityKind === "crystallization");
  assert.equal(cryst.length, 1, "the distinction is drawn once across the run");
  const c = cryst[0]!;
  assert.equal(c.kind === "activity" && c.activityKind === "crystallization" && c.cycleMark, 0);
  // the record is lean — it carries no self datum, only the act (no continuity claim, §7)
  assert.equal(Object.prototype.hasOwnProperty.call(c, "datum"), false);
});

test("each cycle records an expectation reading per entity; confidence ramps (INV-5)", () => {
  const { cycle, events } = freshCycle();
  for (let i = 0; i < 4; i++) cycle.run({ signals: [weather("sun")], changes: [] });
  const exp = events
    .all()
    .filter((r): r is import("../store/resist-event.js").ExpectationActivity =>
      r.kind === "activity" && r.activityKind === "expectation" && r.entity === "weather",
    )
    .sort((a, b) => a.cycleMark - b.cycleMark);
  assert.ok(exp.length >= 4, "one expectation line per cycle for the recurring entity");
  // confidence and recurrence both climb with exposure — the accumulation signature
  assert.ok(exp[0]!.confidence < exp[exp.length - 1]!.confidence, "confidence ramps up");
  assert.ok(exp[0]!.recurrence < exp[exp.length - 1]!.recurrence, "recurrence climbs");
  assert.equal(exp[exp.length - 1]!.confidence, 1, "reaches saturation");
});

test("a layer's lateral emission is recorded in [event] with its issuing layer (§6.4)", () => {
  // Wrap T3 so it raises a query during its work — the seam a real host drives.
  const base = createT3();
  const emittingT3 = {
    ...base,
    process(input: Parameters<typeof base.process>[0], field: Parameters<typeof base.process>[1], emit: Parameters<typeof base.process>[2]) {
      emit({ kind: "query", channel: "ch" }); // a T3 query (§6.4)
      return base.process(input, field, emit);
    },
  };
  const data = createDataStore();
  const events = createEventLog();
  const cycle = createCycle({
    layers: { ...freshLayers(), t3: emittingT3 },
    glob: createGlobMod({ appraisalGain: 1 }, 0),
    data,
    events,
    initialEmission: { action: "boot" },
  });
  cycle.run({ signals: [weather("sun")], changes: [] });

  const emissions = events
    .all()
    .filter((r) => r.kind === "activity" && r.activityKind === "emission");
  // the T3 query + the terminal T8 response
  const t3q = emissions.find((r) => r.kind === "activity" && r.activityKind === "emission" && r.issuingLayer === 3);
  assert.ok(t3q, "the T3 query was recorded as an emission naming issuing layer 3");
  assert.equal(t3q!.kind === "activity" && t3q!.activityKind === "emission" && t3q!.register, "↔");
  assert.deepEqual(
    t3q!.kind === "activity" && t3q!.activityKind === "emission" ? t3q!.action : null,
    { kind: "query", channel: "ch" },
  );
  // the terminal response still lands, attributed to T8
  assert.ok(
    emissions.some((r) => r.kind === "activity" && r.activityKind === "emission" && r.issuingLayer === 8),
    "the appraisal-driven terminal response is still issued by T8",
  );
});

test("a collision is recorded as a scar in the [event] log", () => {
  const { cycle, events } = freshCycle();
  // first cycle establishes the expectation for 'weather' (predicts itself, no error)
  cycle.run({ signals: [weather("sun")], changes: [] });
  // second cycle returns a different value → resistance → scar
  const r = cycle.run({ signals: [weather("rain")], changes: [] });
  assert.ok(r.scars >= 1);
  assert.ok(events.size() >= 1);
  const rec = events.all().find((x): x is import("../store/resist-event.js").EventRecord => x.kind === "scar")!;
  assert.equal(rec.scar.fixed.provenance, "scar");
  assert.equal(rec.event.mismatch_kind, "value-mismatch");
  assert.notEqual(rec.event.received, null); // a value was received (not absence)
});

test("the [event] record inherits the cycle datum's domain tag (auditable)", () => {
  const { cycle, events } = freshCycle();
  cycle.run({ signals: [weather("sun")], changes: [] });
  cycle.run({ signals: [weather("rain")], changes: [] });
  const scar = events.all().find((x): x is import("../store/resist-event.js").EventRecord => x.kind === "scar")!;
  assert.equal(scar.scar.open.domain, "cycle");
});

test("the response feeds back as the next cycle's emission (INV-1)", () => {
  const { cycle } = freshCycle();
  const r0 = cycle.run({ signals: [weather("sun")], changes: [] });
  // the response carries the cycle that produced it; next cycle's T2 sees it.
  assert.equal((r0.response.action as { kind: string }).kind, "respond");
  // a second cycle runs without error, consuming the fed-back emission
  assert.doesNotThrow(() => cycle.run({ signals: [weather("sun")], changes: [] }));
});

test("GLOB-MOD advances to N+1 each cycle (INV-7)", () => {
  const { cycle, glob } = freshCycle();
  assert.equal(glob.cycle(), 0);
  cycle.run({ signals: [weather("sun")], changes: [] });
  assert.equal(glob.cycle(), 1);
  cycle.run({ signals: [weather("sun")], changes: [] });
  assert.equal(glob.cycle(), 2);
});

test("the appraisal reflects the field context (§8.5): different gain, different valence", () => {
  // high gain field amplifies the resistance's negative valence
  const data = createDataStore();
  const events = createEventLog();
  const glob = createGlobMod({ appraisalGain: 10 }, 0);
  const cycle = createCycle({
    layers: freshLayers(),
    glob,
    data,
    events,
    initialEmission: { action: "boot" },
  });
  cycle.run({ signals: [weather("sun")], changes: [] });
  const r = cycle.run({ signals: [weather("rain")], changes: [] });
  // resistance=1 under gain 10 → valence -10 (context-dependent)
  assert.equal(r.appraisal.valence, -10);
});

test("an absence is registered when an expected entity stops returning", () => {
  const { cycle } = freshCycle();
  cycle.run({ signals: [weather("sun")], changes: [] }); // 'weather' seen
  const r = cycle.run({ signals: [], changes: [] }); // nothing returns
  assert.ok(r.absences >= 1);
});
