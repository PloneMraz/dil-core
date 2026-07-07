/**
 * Smoke test — multi-stream flow (protocol §6, §13.3).
 *
 * Fixed checks: cycle-0 runs single-threaded and cycle-1 onward multi-stream,
 * with the mode recorded as the `flow` open tag (trace-visible); fan-out is
 * real (T5's one published output is read by both T6 and T7; T6 reads T2
 * itself); consuming an unpublished dependency is refused; behaviour is
 * unchanged across the mode switch (collisions still scar); and §13.3 verifies
 * the recorded mode against the cycle-mark.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createCycle, type Layers } from "./cycle.js";
import { createGlobMod } from "./glob-mod.js";
import { createMeaningChannel } from "./meaning-channel.js";
import { gatherT6, gatherT7, MultiStreamError } from "./gathers.js";
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
import { admitHostData } from "../store/tagging-gate.js";
import { toRunning, toScar, stampLayer } from "../store/data-store.js";
import { recordScar, type ContextAnchor } from "../store/resist-event.js";
import { CONTEXT_ANCHOR_DEPTH } from "../store/decisions.js";
import { checkConformance } from "../conformance/checker.js";
import type { Signal, InfoUnit } from "./types.js";
import type { T2Output } from "./layers/t2.js";
import type { T5Output } from "./layers/t5.js";

function freshLayers(): Layers {
  return {
    t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
    t5: createT5(), t6: createT6(), t7: createT7(), t8: createT8(),
  };
}

function freshCycle() {
  const data = createDataStore();
  const events = createEventLog();
  const glob = createGlobMod({ appraisalGain: 1 }, 0);
  const cycle = createCycle({
    layers: freshLayers(), glob, data, events,
    initialEmission: { action: "boot" },
  });
  return { cycle, data, events, glob };
}

function weather(value: unknown, t = 1): Signal {
  return { source_id: "ch", raw_payload: { entity: "weather", value }, t };
}

// ── Mode switch ─────────────────────────────────────────────────────────────

test("cycle-0 runs single-threaded; cycle-1 onward runs multi-stream", () => {
  const { cycle } = freshCycle();
  const r0 = cycle.run({ signals: [weather("sun")], changes: [] });
  const r1 = cycle.run({ signals: [weather("sun")], changes: [] });
  const r2 = cycle.run({ signals: [weather("sun")], changes: [] });
  assert.equal(r0.flow, "single-threaded");
  assert.equal(r1.flow, "multi-stream");
  assert.equal(r2.flow, "multi-stream");
});

test("the flow mode is recorded as an open tag on the cycle datum (trace-visible)", () => {
  const { cycle, data } = freshCycle();
  cycle.run({ signals: [weather("sun")], changes: [] });
  cycle.run({ signals: [weather("sun")], changes: [] });
  assert.equal(data.get("cycle-0")!.open.flow, "single-threaded");
  assert.equal(data.get("cycle-1")!.open.flow, "multi-stream");
});

test("both modes stamp the identical T1→T8 floor-tag path (INV traversal parity)", () => {
  const { cycle, data } = freshCycle();
  cycle.run({ signals: [weather("sun")], changes: [] });
  cycle.run({ signals: [weather("sun")], changes: [] });
  assert.deepEqual(data.get("cycle-0")!.trace, [1, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(data.get("cycle-1")!.trace, [1, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(data.get("cycle-1")!.fixed.floorTag, 8);
});

test("behaviour is unchanged across the switch: a multi-stream collision still scars", () => {
  const { cycle, events } = freshCycle();
  cycle.run({ signals: [weather("sun")], changes: [] }); // cycle-0, single-threaded
  const r1 = cycle.run({ signals: [weather("rain")], changes: [] }); // multi-stream mismatch
  assert.equal(r1.flow, "multi-stream");
  assert.ok(r1.scars >= 1);
  assert.equal(events.all()[0]!.scar.open.flow, "multi-stream"); // the scar carries the mode
});

// ── Consumption, not dispatch ───────────────────────────────────────────────

function unit(value: unknown): InfoUnit {
  return { content: { value }, ref_frame: { boundLayer: 5, ref: "x" }, t: 1, layer_trace: [5] };
}

test("fan-out is real: T6 and T7 both read T5's single published output", () => {
  const ch = createMeaningChannel();
  const t2out: T2Output = { tagged: [{ change: { id: "e", value: 1 }, agency: "ENV_PUSHED" }] };
  const t5out: T5Output = {
    results: [{
      entity_id: "e",
      expectation: { predicted: unit("v"), confidence: 1, built_from: [] },
      predErr: { observed: unit("v"), predicted: unit("v"), delta: 0, signed: "+" },
    }],
  };
  ch.publish(2, t2out);
  ch.publish(5, t5out);
  const forT6 = gatherT6(ch);
  const forT7 = gatherT7(ch);
  // the SAME published results object reached both consumers
  assert.equal(forT6.results, t5out.results);
  assert.ok(forT7.observed.has("e"));
  // and T6 read T2's output itself — the env-pushed evidence came off the channel
  assert.ok(forT6.envPushed!.has("e"));
});

test("consuming an unpublished dependency is refused (no silent empty input)", () => {
  const ch = createMeaningChannel();
  ch.publish(2, { tagged: [] } as T2Output); // T2 published, T5 did not
  assert.throws(() => gatherT6(ch), MultiStreamError);
});

// ── §13.3 verifies the recorded mode against the cycle-mark ────────────────

test("§13.3 passes on a real run and reports the flow mode as recorded", () => {
  const { cycle, events } = freshCycle();
  cycle.run({ signals: [weather("sun")], changes: [] });
  cycle.run({ signals: [weather("rain")], changes: [] }); // scar at cycle 1
  const report = checkConformance(events, {});
  const c3 = report.results.find((r) => r.id === "3")!;
  assert.equal(c3.verdict, "pass");
  assert.ok(c3.detail.includes("flow mode recorded and consistent"));
});

test("§13.3 fails when a scar's recorded flow contradicts its cycle-mark", () => {
  // forge a record claiming single-threaded at cycle 3
  let d = admitHostData(
    { payload: 1, admittingLayer: 1, open: { domain: "cycle", phase: "loop", flow: "single-threaded" } },
    3,
  );
  d = toRunning(d, 3);
  for (const layer of [2, 3, 4, 5, 6, 7, 8] as const) d = stampLayer(d, layer);
  d = toScar(d, true);
  const anchor: ContextAnchor = { depth: CONTEXT_ANCHOR_DEPTH, cycle: 3, fieldState: {} };
  const events = createEventLog();
  events.append(recordScar(
    d,
    { source_id: "x", expected: 1, received: 2, mismatch_kind: "value-mismatch", t: 3 },
    anchor,
  ));
  const report = checkConformance(events, {});
  const c3 = report.results.find((r) => r.id === "3")!;
  assert.equal(c3.verdict, "fail");
  assert.ok(c3.detail.includes("contradicts its cycle-mark"));
});
