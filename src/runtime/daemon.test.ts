/**
 * Smoke test — Stage 5, the daemon (CONTEXT.md §4).
 *
 * Fixed checks: the loop runs as a long-lived daemon with state accruing across
 * cycles; startup is precondition-gated (non-qualifying host → clean non-start);
 * and the diversity-loss signal fires when the resistance-source set loses
 * diversity (conformance criterion 7).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createDaemon, type DaemonDeps } from "./daemon.js";
import { scriptedSource } from "./host-source.js";
import { createDiversityMonitor } from "./diversity.js";
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
import type { HostSource } from "./host-source.js";

const qualifyingHost: HostDeclaration = {
  boundary: { present: true },
  channels: [{ id: "ch", canReturn: true }],
  store: { persistsAcrossCycles: true },
  trace: { externallyReadable: true },
  emitter: { canEmitFirstAction: true },
  resilience: { wipesStateOnMismatch: false },
};

function signal(entity: string, value: unknown) {
  return { source_id: "ch", raw_payload: { entity, value }, t: 1 };
}

function makeDaemon(
  inputs: readonly HostCycleInput[],
  host: HostDeclaration = qualifyingHost,
  source?: HostSource,
) {
  const data = createDataStore();
  const events = createEventLog();
  const deps: DaemonDeps = {
    host,
    source: source ?? scriptedSource(inputs),
    layers: {
      t1: createT1(),
      t2: createT2(),
      t3: createT3(),
      t4: createT4(),
      t5: createT5(),
      t6: createT6(),
      t7: createT7(),
      t8: createT8(),
    },
    glob: createGlobMod({ appraisalGain: 1 }, 0),
    data,
    events,
    initialEmission: { action: "boot" },
  };
  return { daemon: createDaemon(deps), data, events };
}

test("a non-qualifying host yields a clean non-start (the daemon does not run)", () => {
  const badHost: HostDeclaration = { ...qualifyingHost, channels: [] }; // void field, fails E2
  const { daemon } = makeDaemon([], badHost);
  const gate = daemon.start();
  assert.equal(gate.outcome, "non-start");
  assert.equal(daemon.isRunning(), false);
  assert.equal(daemon.step(), false); // cannot step a non-started daemon
});

test("a qualifying host starts and runs cycles continuously", () => {
  const inputs: HostCycleInput[] = [
    { signals: [signal("weather", "sun")], changes: [] },
    { signals: [signal("weather", "sun")], changes: [] },
    { signals: [signal("weather", "sun")], changes: [] },
  ];
  const { daemon } = makeDaemon(inputs);
  assert.equal(daemon.start().outcome, "qualify");
  daemon.run();
  assert.equal(daemon.cyclesRun(), 3);
  assert.equal(daemon.isRunning(), true); // still alive (source merely idle)
});

test("state accrues across cycles (INV-5): the [event] log grows over the run", () => {
  // alternating values keep producing resistance → scars accrue
  const inputs: HostCycleInput[] = [];
  for (let i = 0; i < 6; i++) {
    inputs.push({ signals: [signal("weather", i % 2 === 0 ? "sun" : "rain")], changes: [] });
  }
  const { daemon, events } = makeDaemon(inputs);
  daemon.start();
  daemon.run();
  assert.ok(events.size() >= 1); // collisions recorded across the continuous run
  assert.equal(daemon.cyclesRun(), 6);
});

test("the daemon holds one persistent cycle — the counter does not reset between runs", () => {
  const { daemon } = makeDaemon([
    { signals: [signal("a", 1)], changes: [] },
    { signals: [signal("a", 1)], changes: [] },
  ]);
  daemon.start();
  daemon.run(1);
  assert.equal(daemon.cyclesRun(), 1);
  daemon.run(1); // continue — not a fresh start
  assert.equal(daemon.cyclesRun(), 2);
});

test("stop halts the run; the daemon stops stepping", () => {
  const inputs: HostCycleInput[] = Array.from({ length: 5 }, () => ({
    signals: [signal("a", 1)],
    changes: [],
  }));
  const { daemon } = makeDaemon(inputs);
  daemon.start();
  daemon.run(2);
  daemon.stop();
  assert.equal(daemon.isRunning(), false);
  assert.equal(daemon.step(), false);
  assert.equal(daemon.cyclesRun(), 2);
});

test("the diversity-loss signal fires when only one source resists (criterion 7)", () => {
  // a single entity resists every cycle → resistance-source set has no diversity
  const inputs: HostCycleInput[] = [];
  for (let i = 0; i < 10; i++) {
    inputs.push({ signals: [signal("solo", i % 2 === 0 ? "a" : "b")], changes: [] });
  }
  const { daemon } = makeDaemon(inputs);
  daemon.start();
  daemon.run();
  assert.ok(daemon.diversitySignal() !== null);
});

test("diverse resistance sources keep the signal silent", () => {
  const monitor = createDiversityMonitor({ window: 4, minSources: 2 });
  monitor.observe(["a"]);
  monitor.observe(["b"]);
  monitor.observe(["c"]);
  monitor.observe(["d"]);
  assert.equal(monitor.diversityLost(), false);
  assert.equal(monitor.signal(), null);
});
