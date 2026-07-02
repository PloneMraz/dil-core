/**
 * Smoke test — Stage 6, the conformance checker (protocol §13).
 *
 * Runs a real daemon, then scores the seven criteria from its [event] log and
 * observable facts. Asserts the checker produces a genuine per-criterion table
 * and is honest where a criterion is not fully trace-verifiable.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { checkConformance } from "./checker.js";
import { renderConformance } from "./render.js";
import { createDaemon } from "../runtime/daemon.js";
import { scriptedSource } from "../runtime/host-source.js";
import { createGlobMod } from "../loop/glob-mod.js";
import { createT1 } from "../loop/layers/t1.js";
import { createT2 } from "../loop/layers/t2.js";
import { createT3 } from "../loop/layers/t3.js";
import { createT4 } from "../loop/layers/t4.js";
import { createT5 } from "../loop/layers/t5.js";
import { createT6 } from "../loop/layers/t6.js";
import { createT7 } from "../loop/layers/t7.js";
import { createT8 } from "../loop/layers/t8.js";
import { createDataStore } from "../store/data-store.js";
import { createEventLog } from "../store/event-log.js";
import type { HostDeclaration } from "../host/declaration.js";
import type { HostCycleInput } from "../loop/cycle.js";
import type { EventLog } from "../store/event-log.js";

const host: HostDeclaration = {
  boundary: { present: true },
  channels: [{ id: "ch", canReturn: true }],
  store: { persistsAcrossCycles: true },
  trace: { externallyReadable: true },
  emitter: { canEmitFirstAction: true },
  resilience: { wipesStateOnMismatch: false },
};

function sig(entity: string, value: unknown) {
  return { source_id: "ch", raw_payload: { entity, value }, t: 1 };
}

/** Run a daemon over some inputs and return its [event] log + gate outcome. */
function runDaemon(inputs: readonly HostCycleInput[]) {
  const events = createEventLog();
  const daemon = createDaemon({
    host,
    source: scriptedSource(inputs),
    layers: {
      t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
      t5: createT5(), t6: createT6(), t7: createT7(), t8: createT8(),
    },
    glob: createGlobMod({ appraisalGain: 1 }, 0),
    data: createDataStore(),
    events,
    initialEmission: { action: "boot" },
  });
  const gate = daemon.start();
  daemon.run();
  return { events, gate, daemon };
}

test("the checker produces a verdict for all seven criteria", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] },
    { signals: [sig("market", "up")], changes: [] },
    { signals: [sig("market", "down")], changes: [] },
  ]);
  const report = checkConformance(events, { gate, diversityWired: true });
  assert.equal(report.results.length, 7);
  assert.deepEqual(
    report.results.map((r) => r.id),
    ["1", "2", "3", "4", "5", "6", "7"],
  );
});

test("Store (§13.6) passes: every scar is well-formed with domain + anchor", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] },
  ]);
  const report = checkConformance(events, { gate, diversityWired: true });
  const store = report.results.find((r) => r.id === "6")!;
  assert.equal(store.verdict, "pass");
});

test("Loop (§13.3) passes: every scar shows a T1→T8 traversal", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] },
  ]);
  const report = checkConformance(events, { gate, diversityWired: true });
  assert.equal(report.results.find((r) => r.id === "3")!.verdict, "pass");
});

test("Host conditions (§13.2) reflect the gate outcome", () => {
  const { events, gate } = runDaemon([{ signals: [sig("weather", "sun")], changes: [] }]);
  const report = checkConformance(events, { gate, diversityWired: true });
  assert.equal(report.results.find((r) => r.id === "2")!.verdict, "pass");
});

test("Self (§13.4) is reported partial — continuity is third-party-attributable", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] },
  ]);
  const report = checkConformance(events, { gate, diversityWired: true });
  assert.equal(report.results.find((r) => r.id === "4")!.verdict, "partial");
});

test("Resistance (§13.5) is partial while reflection is deferred", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "rain")], changes: [] },
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("market", "down")], changes: [] },
  ]);
  const report = checkConformance(events, { gate, diversityWired: true, reflectionWired: false });
  assert.equal(report.results.find((r) => r.id === "5")!.verdict, "partial");
});

test("an empty [event] log is honestly reported unverifiable, not passed", () => {
  const events: EventLog = createEventLog();
  const report = checkConformance(events, {});
  assert.equal(report.results.find((r) => r.id === "6")!.verdict, "unverifiable");
  assert.equal(report.results.find((r) => r.id === "1")!.verdict, "unverifiable");
});

test("the report renders a readable table", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] },
  ]);
  const text = renderConformance(checkConformance(events, { gate, diversityWired: true }));
  assert.ok(text.includes("Conformance (§13)"));
  assert.ok(text.includes("§13.6 Store"));
});
