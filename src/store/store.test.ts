/**
 * Smoke test — Stage 3, the experience store (AGENTS.md "Build & Test").
 *
 * Fixed checks this stage must satisfy:
 *   - data goes in and comes out correctly tagged;
 *   - no [event] record can be altered or removed.
 * Plus the lifecycle rules and the full field-state context anchor.
 *
 * node:test on the in-memory store — no loop yet.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { admitHostData, TaggingGateError } from "./tagging-gate.js";
import { createEventLog } from "./event-log.js";
import {
  createDataStore,
  toRunning,
  toScar,
  LifecycleError,
} from "./data-store.js";
import type { EventRecord } from "./resist-event.js";
import { CONTEXT_ANCHOR_DEPTH } from "./decisions.js";

// ── Tagging-gate ──────────────────────────────────────────────────────────

/** A valid open-tag set: ≥3 tags, one being domain, none a verdict. */
const openOK = { domain: "weather", format: "json", platform: "cli" };

test("host data is admitted stamped prior, no cycle-mark, floor-tag set", () => {
  const d = admitHostData(
    { payload: "hello", admittingLayer: 1, open: openOK },
    1000,
  );
  assert.equal(d.fixed.provenance, "prior");
  assert.equal(d.fixed.cycleMark, null);
  assert.equal(d.fixed.floorTag, 1);
  assert.equal(d.fixed.timestamp, 1000);
  assert.equal(d.payload, "hello");
});

test("the four fixed tags are present and in order", () => {
  const d = admitHostData({ payload: 1, admittingLayer: 3, open: openOK }, 5);
  assert.deepEqual(Object.keys(d.fixed), [
    "timestamp",
    "cycleMark",
    "provenance",
    "floorTag",
  ]);
});

test("tagging-gate requires the mandatory open tag domain (auditability)", () => {
  assert.throws(
    () =>
      admitHostData(
        { payload: "x", admittingLayer: 1, open: { format: "json", platform: "cli" } },
        0,
      ),
    TaggingGateError,
  );
  // also rejected when domain is present but empty
  assert.throws(
    () =>
      admitHostData(
        { payload: "x", admittingLayer: 1, open: { domain: "", format: "json", platform: "cli" } },
        0,
      ),
    TaggingGateError,
  );
});

test("tagging-gate requires at least three open tags", () => {
  assert.throws(
    () =>
      admitHostData(
        { payload: "x", admittingLayer: 1, open: { domain: "weather", format: "json" } },
        0,
      ),
    TaggingGateError,
  );
});

test("tagging-gate rejects open tags that name a verdict (no side door)", () => {
  assert.throws(
    () =>
      admitHostData(
        {
          payload: "x",
          admittingLayer: 1,
          open: { domain: "weather", format: "json", platform: "cli", quality: "high" },
        },
        0,
      ),
    TaggingGateError,
  );
});

test("a compliant open-tag set is accepted", () => {
  const d = admitHostData({ payload: "x", admittingLayer: 1, open: openOK }, 0);
  assert.equal(d.open.domain, "weather");
  assert.equal(d.open.format, "json");
  assert.equal(d.open.platform, "cli");
});

// ── [event] immutability ──────────────────────────────────────────────────

function sampleRecord(source_id = "s1"): EventRecord {
  return {
    event: {
      source_id,
      expected: "sun",
      received: "rain",
      mismatch_kind: "value-mismatch",
      t: 1,
    },
    fixed: { timestamp: 1, cycleMark: 2, provenance: "scar", floorTag: 7 },
    anchor: {
      depth: CONTEXT_ANCHOR_DEPTH,
      cycle: 2,
      fieldState: { gain: 0.5, bias: 0.1 },
    },
  };
}

test("an appended [event] record cannot be altered (deep-frozen)", () => {
  const log = createEventLog();
  log.append(sampleRecord());
  const rec = log.all()[0]!;
  assert.throws(() => {
    // @ts-expect-error — intentionally attempting to mutate a frozen record
    rec.event.received = "snow";
  }, TypeError);
  // nested field is frozen too
  assert.throws(() => {
    // @ts-expect-error — intentional
    rec.anchor.fieldState.gain = 9;
  }, TypeError);
  assert.equal(log.all()[0]!.event.received, "rain");
});

test("the [event] log exposes no remove/update API", () => {
  const log = createEventLog();
  const keys = Object.keys(log);
  assert.ok(!keys.includes("remove"));
  assert.ok(!keys.includes("delete"));
  assert.ok(!keys.includes("update"));
  assert.ok(!keys.includes("set"));
});

test("[event] is append-only and indexed by source_id", () => {
  const log = createEventLog();
  log.append(sampleRecord("a"));
  log.append(sampleRecord("b"));
  log.append(sampleRecord("a"));
  assert.equal(log.size(), 3);
  assert.equal(log.bySourceId("a").length, 2);
  assert.equal(log.bySourceId("b").length, 1);
});

test("each [event] anchors the full field-state of its cycle", () => {
  const log = createEventLog();
  log.append(sampleRecord());
  const rec = log.all()[0]!;
  assert.equal(rec.anchor.depth, "full-field-state");
  assert.equal(rec.anchor.cycle, 2);
  assert.deepEqual(rec.anchor.fieldState, { gain: 0.5, bias: 0.1 });
});

// ── Lifecycle prior → running → scar ──────────────────────────────────────

test("prior → running acquires a cycle-mark", () => {
  const prior = admitHostData({ payload: "p", admittingLayer: 1, open: openOK }, 0);
  const running = toRunning(prior, 4);
  assert.equal(running.fixed.provenance, "running");
  assert.equal(running.fixed.cycleMark, 4);
});

test("running → scar requires a held collision", () => {
  const running = toRunning(admitHostData({ payload: "p", admittingLayer: 1, open: openOK }, 0), 4);
  const scar = toScar(running, true);
  assert.equal(scar.fixed.provenance, "scar");
});

test("running without a held collision cannot become a scar", () => {
  const running = toRunning(admitHostData({ payload: "p", admittingLayer: 1, open: openOK }, 0), 4);
  assert.throws(() => toScar(running, false), LifecycleError);
});

test("a prior cannot jump straight to scar (running does not wash a prior)", () => {
  const prior = admitHostData({ payload: "p", admittingLayer: 1, open: openOK }, 0);
  assert.throws(() => toScar(prior, true), LifecycleError);
});

test("[data] is mutable and clearable each cycle", () => {
  const data = createDataStore();
  const d = admitHostData({ payload: "p", admittingLayer: 1, open: openOK }, 0);
  data.put("k", d);
  assert.ok(data.has("k"));
  data.clear();
  assert.equal(data.size(), 0);
});
