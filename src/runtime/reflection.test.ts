/**
 * Smoke test — reflection, the tag-E mechanism (protocol §8.4).
 *
 * Fixed checks: coordinates address REAL recorded collisions (a reading about a
 * collision that never happened is refused); the reading enters through T3 on a
 * declared channel (no side door), binds to the reader-as-Other at T4, and is
 * classified ENV_PUSHED by the agency-gate; a running daemon ingests a
 * reflection cycle without halting. No self-reflection faculty is exercised —
 * every reading here is formed by the test acting as the third party.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  collisionCoordinates,
  formReading,
  reflectionSignal,
  reflectionTransducer,
  ReflectionError,
} from "./reflection.js";
import { createDaemon, type DaemonDeps } from "./daemon.js";
import { scriptedSource } from "./host-source.js";
import { createGlobMod } from "../loop/glob-mod.js";
import { runLayer } from "../loop/layer.js";
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
import { admitHostData } from "../store/tagging-gate.js";
import type { HostDeclaration } from "../host/declaration.js";
import type { HostCycleInput } from "../loop/cycle.js";
import type { ModField } from "../loop/types.js";

const host: HostDeclaration = {
  boundary: { present: true },
  channels: [{ id: "ch", canReturn: true }],
  store: { persistsAcrossCycles: true },
  trace: { externallyReadable: true },
  emitter: { canEmitFirstAction: true },
  resilience: { wipesStateOnMismatch: false },
};
const field: ModField = { params: {}, t: 0 };
const open = { domain: "test", format: "json", platform: "cli" };
const datum = () => admitHostData({ payload: 1, admittingLayer: 1, open }, 0);

function sig(entity: string, value: unknown) {
  return { source_id: "ch", raw_payload: { entity, value }, t: 1 };
}

/** Run a daemon far enough to record at least one scar. */
function daemonWithScar() {
  const events = createEventLog();
  const source = scriptedSource([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] }, // collision → scar
  ] as HostCycleInput[]);
  const deps: DaemonDeps = {
    host,
    source,
    layers: {
      t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
      t5: createT5(), t6: createT6(), t7: createT7(), t8: createT8(),
    },
    glob: createGlobMod({ appraisalGain: 1 }, 0),
    data: createDataStore(),
    events,
    initialEmission: { action: "boot" },
  };
  const daemon = createDaemon(deps);
  daemon.start();
  daemon.run();
  return { daemon, events };
}

test("collisionCoordinates addresses the real recorded collisions", () => {
  const { events } = daemonWithScar();
  const coords = collisionCoordinates(events);
  assert.ok(coords.length >= 1);
  assert.equal(coords[0]!.index, 0);
  assert.equal(coords[0]!.source_id, "weather");
  assert.equal(coords[0]!.mismatch_kind, "value-mismatch");
});

test("a reading about a collision that never happened is refused", () => {
  const { events } = daemonWithScar();
  assert.throws(
    () => formReading(events, 999, "reader-1", "you drifted"),
    ReflectionError,
  );
});

test("formReading copies the coordinate of the addressed record", () => {
  const { events } = daemonWithScar();
  const reading = formReading(events, 0, "reader-1", "expectation built on dry-season data");
  assert.equal(reading.about.index, 0);
  assert.equal(reading.about.source_id, "weather");
  assert.equal(reading.reader_id, "reader-1");
});

test("the reading enters through T3 on the declared channel, typed reflection", () => {
  const { events } = daemonWithScar();
  const reading = formReading(events, 0, "reader-1", "note");
  const signal = reflectionSignal(reading, "reflect", 9);
  const t3 = createT3({ reflect: reflectionTransducer });
  const out = runLayer(t3, { signals: [signal] }, field, datum());
  const content = out.output.units[0]!.content as {
    infoType: string; channel: string; value: { value: unknown };
  };
  assert.equal(content.infoType, "reflection");
  assert.equal(content.channel, "reflect"); // physical channel preserved
  assert.equal(content.value.value, reading);
});

test("T4 binds the reading to the reader-as-Other", () => {
  const { events } = daemonWithScar();
  const reading = formReading(events, 0, "reader-1", "note");
  const t3 = createT3({ reflect: reflectionTransducer });
  const t3out = runLayer(t3, { signals: [reflectionSignal(reading, "reflect", 9)] }, field, datum());
  const t4out = runLayer(createT4(), { units: t3out.output.units }, field, datum());
  assert.equal(t4out.output.bound[0]!.entity_id, "reader-1");
});

test("the agency-gate classifies a reading ENV_PUSHED (the agent never emitted it)", () => {
  const { events } = daemonWithScar();
  const reading = formReading(events, 0, "reader-1", "note");
  const t2 = createT2({ stabilityThreshold: 1 });
  runLayer(t2, { env: envUnit(), emitted: { action: "boot" }, changes: [] }, field, datum());
  const out = runLayer(
    t2,
    { env: envUnit(), emitted: { action: "respond" }, changes: [{ id: "reader-1", value: reading }] },
    field,
    datum(),
  );
  assert.equal(out.output.tagged[0]!.agency, "ENV_PUSHED");
});

function envUnit() {
  return {
    content: { present: true, count: 1, sources: ["ch"] },
    ref_frame: { boundLayer: 1 as const, ref: "activity-environment" },
    t: 1,
    layer_trace: [1 as const],
  };
}

test("the SAME running daemon ingests a reflection about its own scar without halting", () => {
  const events = createEventLog();
  // A live-ish source: the first two cycles collide; on the third request the
  // third party (this test) reads the agent's own [event] log and returns the
  // reading — reflection re-entering the same loop, not a fresh agent.
  let i = 0;
  const source = {
    next(): HostCycleInput | null {
      i += 1;
      if (i === 1) return { signals: [sig("weather", "sun")], changes: [] };
      if (i === 2) return { signals: [sig("weather", "rain")], changes: [] };
      if (i === 3 && events.size() >= 1) {
        const reading = formReading(events, 0, "reader-1", "history window skewed dry");
        return {
          signals: [reflectionSignal(reading, "reflect", 9)],
          changes: [{ id: "reader-1", value: reading }],
        };
      }
      return null;
    },
    deliver(): void {},
  };
  const deps: DaemonDeps = {
    host,
    source,
    layers: {
      t1: createT1(), t2: createT2(), t3: createT3({ reflect: reflectionTransducer }),
      t4: createT4(), t5: createT5(), t6: createT6(), t7: createT7(), t8: createT8(),
    },
    glob: createGlobMod({ appraisalGain: 1 }, 0),
    data: createDataStore(),
    events,
    initialEmission: { action: "boot" },
  };
  const daemon = createDaemon(deps);
  daemon.start();
  assert.doesNotThrow(() => daemon.run());
  assert.equal(daemon.cyclesRun(), 3); // the reflection cycle ran on the same daemon
  assert.ok(events.size() >= 1); // the scar the reading was about
});
