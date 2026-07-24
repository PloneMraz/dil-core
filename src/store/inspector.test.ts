/**
 * Smoke test — the read-only inspector.
 *
 * Asserts it renders [data] and [event] with their derived names and counts,
 * and that inspecting never mutates the store (read-only).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { admitHostData } from "./tagging-gate.js";
import {
  createDataStore,
  stampLayer,
  toRunning,
  toScar,
} from "./data-store.js";
import { createEventLog } from "./event-log.js";
import { recordScar, recordLayerExit, recordProvenance, type ContextAnchor } from "./resist-event.js";
import { inspectData, inspectEventLog } from "./inspector.js";
import { CONTEXT_ANCHOR_DEPTH } from "./decisions.js";

const TS = Date.UTC(2026, 5, 30);
const open = { domain: "weather", format: "json", platform: "cli" };
const anchor: ContextAnchor = {
  depth: CONTEXT_ANCHOR_DEPTH,
  cycle: 2,
  fieldState: {},
};

test("inspectData renders a header count and one line per datum", () => {
  const store = createDataStore();
  store.put("a", admitHostData({ payload: "alpha", admittingLayer: 1, open }, TS));
  store.put("b", admitHostData({ payload: "beta", admittingLayer: 1, open }, TS));
  const out = inspectData(store);
  assert.ok(out.startsWith("[data] — 2 item(s)"));
  assert.ok(out.includes("  a  [20260630]_[c-]_[prior]_[T1]_[domain:weather]"));
  assert.ok(out.includes("payload=alpha"));
  assert.ok(out.includes("payload=beta"));
});

test("inspectData shows the present floor-tag and carries no path", () => {
  const store = createDataStore();
  let d = admitHostData({ payload: 1, admittingLayer: 1, open }, TS);
  d = stampLayer(d, 5);
  d = stampLayer(d, 7);
  store.put("x", d);
  const out = inspectData(store);
  assert.ok(out.includes("[T7]")); // floor-tag names the present layer only
  assert.equal(out.includes("trace="), false); // the path lives in [event], not here
});

test("inspectEventLog renders records with their derived names", () => {
  const log = createEventLog();
  let d = admitHostData({ payload: 1, admittingLayer: 1, open }, TS);
  d = toRunning(d, 2);
  d = stampLayer(d, 7);
  d = toScar(d, true);
  log.append(
    recordScar(
      d,
      { source_id: "s", expected: "sun", received: "rain", mismatch_kind: "value-mismatch", t: 1 },
      anchor,
    ),
  );
  const out = inspectEventLog(log);
  assert.ok(out.startsWith("[event-log] — 1 record(s)"));
  assert.ok(out.includes("#0"));
  assert.ok(out.includes("[scar]_[T7]_[domain:weather]"));
  assert.ok(out.includes("sun→rain"));
});

test("inspectEventLog renders lean layer-exit and provenance lines", () => {
  const log = createEventLog();
  log.append(recordLayerExit("cycle-0", 0, 5, 0));
  log.append(recordProvenance("cycle-0", 0, "running", "scar", 0));
  const out = inspectEventLog(log);
  assert.ok(out.includes("[layer-exit] cycle-0 @T5"));
  assert.ok(out.includes("[provenance] cycle-0 running→scar"));
});

test("inspecting does not mutate the store", () => {
  const store = createDataStore();
  store.put("a", admitHostData({ payload: "alpha", admittingLayer: 1, open }, TS));
  const before = store.size();
  inspectData(store);
  inspectData(store);
  assert.equal(store.size(), before);
  // the entry is still intact and unchanged
  assert.equal(store.get("a")?.payload, "alpha");
});
