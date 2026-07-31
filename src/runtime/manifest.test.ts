/**
 * Smoke test — the genesis manifest (the run's DECIDE@IMPL constitution, §9, §8.5).
 *
 * Checks: the collector captures the declared constitution; the daemon writes the
 * manifest as the FIRST [event] record on a fresh log; a resumed (non-empty)
 * durable log gets no second manifest; and a manifest record does not break the
 * §13.6 store-well-formedness check.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { createDaemon, type DaemonDeps } from "./daemon.js";
import { collectManifest } from "./manifest.js";
import { scriptedSource } from "./host-source.js";
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
import { readLogRecords } from "../store/event-sink.js";
import { layoutFor } from "../store/substrate.js";
import { checkConformance } from "../conformance/checker.js";
import type { HostDeclaration } from "../host/declaration.js";
import type { HostCycleInput } from "../loop/cycle.js";

const baseHost: HostDeclaration = {
  boundary: { present: true },
  channels: [{ id: "ch", canReturn: true }],
  store: { persistsAcrossCycles: true },
  trace: { externallyReadable: true },
  emitter: { canEmitFirstAction: true },
  resilience: { wipesStateOnMismatch: false },
};
const sig = (entity: string, value: unknown) => ({ source_id: "ch", raw_payload: { entity, value }, t: 1 });
const oneCycle: HostCycleInput[] = [{ signals: [sig("weather", "sun")], changes: [] }];
const layers = () => ({
  t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
  t5: createT5(), t6: createT6(), t7: createT7(), t8: createT8(),
});

test("collectManifest captures the declared DECIDE@IMPL constitution", () => {
  const m = collectManifest(1);
  assert.equal(m.kind, "manifest");
  assert.equal(m.protocol, "0.3.2");
  assert.equal(m.schemaVersion, 2);
  // a representative slice of the constitution — the values a third party needs
  // to re-appraise the trace under the very constants that governed it
  for (const key of ["tagB_thresholds", "tagC_appraisalAnchor", "tagD_modeBSource", "tagE_reflection", "tagH_forwardBuilding", "diversity"]) {
    assert.ok(key in m.decisions, `manifest carries ${key}`);
  }
  assert.deepEqual(
    (m.decisions as Record<string, unknown>).tagB_thresholds,
    { MATCHING_WINDOW: 8, STABILITY_THRESHOLD: 3, BASELINE_WINDOW: 16, SUFFICIENT_RECURRENCE: 3 },
  );
});

test("the daemon writes the manifest as the first [event] record on a fresh log", () => {
  const events = createEventLog();
  const deps: DaemonDeps = {
    host: baseHost,
    source: scriptedSource(oneCycle),
    layers: layers(),
    glob: createGlobMod({ appraisalGain: 1 }, 0),
    data: createDataStore(),
    events,
    initialEmission: { action: "boot" },
  };
  const daemon = createDaemon(deps);
  daemon.start();
  const recs = events.all();
  assert.equal(recs[0]!.kind, "manifest", "the constitution is the first line");
  assert.equal(recs.filter((r) => r.kind === "manifest").length, 1, "exactly one manifest");
});

test("a manifest record does not break §13.6 store well-formedness", () => {
  const events = createEventLog();
  const daemon = createDaemon({
    host: baseHost,
    source: scriptedSource([
      { signals: [sig("weather", "sun")], changes: [] },
      { signals: [sig("weather", "rain")], changes: [] },
    ]),
    layers: layers(),
    glob: createGlobMod({ appraisalGain: 1 }, 0),
    data: createDataStore(),
    events,
    initialEmission: { action: "boot" },
  });
  const gate = daemon.start();
  daemon.run();
  const store = checkConformance(events, { gate }).results.find((r) => r.id === "6")!;
  assert.notEqual(store.verdict, "fail"); // the manifest is well-formed metadata
});

test("a resumed (non-empty) durable log gets no second manifest — genesis is once", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dil-manifest-"));
  try {
    const mk = () =>
      createDaemon({
        host: { ...baseHost, store: { persistsAcrossCycles: true, root } },
        source: scriptedSource(oneCycle),
        layers: layers(),
        glob: createGlobMod({ appraisalGain: 1 }, 0),
        initialEmission: { action: "boot" },
      });
    const d1 = mk(); d1.start(); d1.run(); d1.close();
    const d2 = mk(); d2.start(); d2.run(); d2.close(); // resume the same durable store

    const recs = readLogRecords(layoutFor(root).eventLog);
    assert.equal(recs.filter((r) => r.kind === "manifest").length, 1, "written once at genesis, never on resume");
    assert.equal(recs[0]!.kind, "manifest");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
