/**
 * Smoke test — the durable [event] sink (protocol §9).
 *
 * Fixed checks: records survive a sink reopen (durability across the process);
 * the sink surface offers no mutation path (write-once by construction); and a
 * serialized record round-trips with its full tag set intact and in fixed order.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { createJsonlFileSink, readJsonlSink, serializeEventRecord } from "./event-sink.js";
import { createEventLog } from "./event-log.js";
import { admitHostData } from "./tagging-gate.js";
import { toRunning, toScar, stampLayer } from "./data-store.js";
import { recordScar, type EventRecord, type ContextAnchor } from "./resist-event.js";
import { CONTEXT_ANCHOR_DEPTH } from "./decisions.js";

const open = { domain: "weather", format: "json", platform: "cli" };
const anchor: ContextAnchor = { depth: CONTEXT_ANCHOR_DEPTH, cycle: 2, fieldState: { gain: 0.5 } };

/** Build a realistic scar-backed [event] record. */
function makeRecord(source_id = "s1"): EventRecord {
  let d = admitHostData({ payload: "obs", admittingLayer: 1, open }, 111);
  d = toRunning(d, 2);
  d = stampLayer(d, 7);
  d = toScar(d, true);
  return recordScar(
    d,
    { source_id, expected: "sun", received: "rain", mismatch_kind: "value-mismatch", t: 2 },
    anchor,
  );
}

function tmpFile(): string {
  return path.join(os.tmpdir(), `dil-sink-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
}

test("records survive a sink reopen (durability across the process)", () => {
  const file = tmpFile();
  try {
    const sink1 = createJsonlFileSink(file);
    sink1.write(makeRecord("a"));
    sink1.write(makeRecord("b"));
    sink1.close();

    // reopen: a fresh sink appends after the existing records, never truncating
    const sink2 = createJsonlFileSink(file);
    sink2.write(makeRecord("c"));
    sink2.close();

    const back = readJsonlSink(file);
    assert.equal(back.length, 3);
    assert.deepEqual(back.map((r) => r.event.source_id), ["a", "b", "c"]);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("the sink surface exposes no mutation path (write-once by construction)", () => {
  const file = tmpFile();
  try {
    const sink = createJsonlFileSink(file);
    const keys = Object.keys(sink);
    assert.ok(!keys.includes("update"));
    assert.ok(!keys.includes("delete"));
    assert.ok(!keys.includes("remove"));
    assert.ok(!keys.includes("truncate"));
    assert.ok(!keys.includes("rewrite"));
    // only write (+ close for the fd) exist
    assert.ok(keys.includes("write"));
    sink.close();
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("a serialized record round-trips with tags intact and in fixed order", () => {
  const rec = makeRecord("s");
  const serialized = serializeEventRecord(rec);
  // fixed order: timestamp, cycle-mark, provenance, floor-tag, open, layer_trace, ...
  assert.deepEqual(Object.keys(serialized), [
    "timestamp",
    "cycleMark",
    "provenance",
    "floorTag",
    "open",
    "layer_trace",
    "payload",
    "event",
    "anchor",
  ]);
  // tags intact
  assert.equal(serialized.provenance, "scar");
  assert.equal(serialized.floorTag, 7);
  assert.equal(serialized.open.domain, "weather");
  assert.deepEqual(serialized.layer_trace, [1, 7]);

  // round-trip through the file preserves the same key order and values
  const file = tmpFile();
  try {
    const sink = createJsonlFileSink(file);
    sink.write(rec);
    sink.close();
    const [back] = readJsonlSink(file);
    assert.deepEqual(Object.keys(back!), Object.keys(serialized));
    assert.equal(back!.open.domain, "weather");
    assert.deepEqual(back!.layer_trace, [1, 7]);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("createEventLog mirrors every appended record to the sink at append time", () => {
  const file = tmpFile();
  try {
    const sink = createJsonlFileSink(file);
    const log = createEventLog(sink);
    log.append(makeRecord("x"));
    log.append(makeRecord("y"));
    sink.close();

    // in-memory log and durable file agree
    assert.equal(log.size(), 2);
    const back = readJsonlSink(file);
    assert.deepEqual(back.map((r) => r.event.source_id), ["x", "y"]);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("createEventLog without a sink stays in-memory only (default for tests)", () => {
  const log = createEventLog();
  log.append(makeRecord("z"));
  assert.equal(log.size(), 1);
});
