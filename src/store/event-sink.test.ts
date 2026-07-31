/**
 * Smoke test — the durable [event] sink (protocol §9).
 *
 * Fixed checks: records survive a sink reopen (durability across the process);
 * the sink surface offers no mutation path (write-once by construction); a
 * serialized record round-trips with its full tag set intact and in fixed
 * order (both kinds: scar and activity); daily/size segmentation rotates
 * without ever splitting or rewriting a record.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  createJsonlFileSink,
  readJsonlSink,
  listSegments,
  serializeEventRecord,
  deserializeEventRecord,
  verifyJsonlSink,
} from "./event-sink.js";
import { createEventLog } from "./event-log.js";
import { admitHostData } from "./tagging-gate.js";
import { toRunning, toScar, stampLayer } from "./data-store.js";
import {
  recordScar,
  recordActivity,
  recordLayerExit,
  recordEmission,
  recordCrystallization,
  recordExpectation,
  type EventRecord,
  type ActivityRecord,
  type ContextAnchor,
} from "./resist-event.js";
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

/** Build a per-cycle activity record. */
function makeActivity(cycle = 2): ActivityRecord {
  let d = admitHostData({ payload: "cyc", admittingLayer: 1, open }, cycle);
  d = toRunning(d, cycle);
  d = stampLayer(d, 8);
  return recordActivity(
    `cycle-${cycle}`,
    d,
    { cycle, flow: "multi-stream", emitted: "respond", observed: ["weather"], scars: 0, t: cycle },
    anchor,
  );
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dil-sink-"));
}

test("records survive a sink reopen (durability across the process)", () => {
  const dir = tmpDir();
  try {
    const sink1 = createJsonlFileSink(dir);
    sink1.write(makeRecord("a"));
    sink1.write(makeRecord("b"));
    sink1.close();

    // reopen: a fresh sink appends after the existing records, never truncating
    const sink2 = createJsonlFileSink(dir);
    sink2.write(makeRecord("c"));
    sink2.close();

    const back = readJsonlSink(dir);
    assert.equal(back.length, 3);
    assert.deepEqual(
      back.map((r) => (r.form === "scar" ? r.event!.source_id : "?")),
      ["a", "b", "c"],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the sink surface exposes no mutation path (write-once by construction)", () => {
  const dir = tmpDir();
  try {
    const sink = createJsonlFileSink(dir);
    const keys = Object.keys(sink);
    for (const forbidden of ["update", "delete", "remove", "truncate", "rewrite"]) {
      assert.ok(!keys.includes(forbidden));
    }
    assert.ok(keys.includes("write"));
    sink.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a scar record round-trips with tags intact and in fixed order", () => {
  const rec = makeRecord("s");
  const serialized = serializeEventRecord(rec);
  assert.deepEqual(Object.keys(serialized), [
    "form",
    "timestamp",
    "cycleMark",
    "provenance",
    "floorTag",
    "open",
    "payload",
    "event",
    "anchor",
  ]);
  if (serialized.form !== "scar") throw new Error("expected a scar form");
  assert.equal(serialized.provenance, "scar");
  assert.equal(serialized.floorTag, 7);
  assert.equal(serialized.open.domain, "weather");

  const dir = tmpDir();
  try {
    const sink = createJsonlFileSink(dir);
    sink.write(rec);
    sink.close();
    const [back] = readJsonlSink(dir);
    assert.deepEqual(Object.keys(back!), Object.keys(serialized));
    if (back!.form !== "scar") throw new Error("expected a scar form");
    assert.equal(back!.open.domain, "weather");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a cycle-seal activity round-trips with the same fixed-order tag set", () => {
  const rec = makeActivity(4);
  const serialized = serializeEventRecord(rec);
  assert.deepEqual(Object.keys(serialized), [
    "form",
    "timestamp",
    "cycleMark",
    "provenance",
    "floorTag",
    "open",
    "payload",
    "datumId",
    "activity",
    "anchor",
  ]);
  if (serialized.form !== "cycle-seal") throw new Error("expected a cycle-seal form");
  assert.equal(serialized.provenance, "running");
  assert.equal(serialized.activity!.cycle, 4);

  const dir = tmpDir();
  try {
    const sink = createJsonlFileSink(dir);
    sink.write(rec);
    sink.close();
    const [back] = readJsonlSink(dir);
    if (back!.form !== "cycle-seal") throw new Error("expected a cycle-seal form");
    assert.equal(back!.activity!.flow, "multi-stream");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a lean layer-exit line round-trips (no datum, no anchor)", () => {
  const rec = recordLayerExit("cycle-3", 3, 5, 3);
  const serialized = serializeEventRecord(rec);
  assert.deepEqual(Object.keys(serialized), ["form", "datumId", "cycleMark", "layer", "t"]);
  const back = deserializeEventRecord(serialized);
  assert.deepEqual(back, rec);
});

test("an emission line round-trips with register ↔ and its issuing layer (§6.4)", () => {
  const rec = recordEmission("cycle-2", 2, 8, { kind: "respond", cycle: 2 }, 2);
  assert.equal(rec.register, "↔");
  const serialized = serializeEventRecord(rec);
  assert.deepEqual(Object.keys(serialized), [
    "form",
    "datumId",
    "cycleMark",
    "issuingLayer",
    "action",
    "register",
    "t",
  ]);
  const back = deserializeEventRecord(serialized);
  assert.deepEqual(back, rec);
});

test("a crystallization line round-trips (§7: lean, no datum, no anchor)", () => {
  const rec = recordCrystallization("cycle-0", 0, 1);
  const serialized = serializeEventRecord(rec);
  assert.deepEqual(Object.keys(serialized), ["form", "datumId", "cycleMark", "t"]);
  const back = deserializeEventRecord(serialized);
  assert.deepEqual(back, rec);
});

test("an expectation line round-trips (INV-5: entity, confidence, recurrence, delta)", () => {
  const rec = recordExpectation("cycle-2", 2, "weather", 0.67, 2, 1, 5);
  const serialized = serializeEventRecord(rec);
  assert.deepEqual(Object.keys(serialized), ["form", "datumId", "cycleMark", "entity", "confidence", "recurrence", "delta", "t"]);
  const back = deserializeEventRecord(serialized);
  assert.deepEqual(back, rec);
});

test("createEventLog mirrors every appended record (both kinds) to the sink", () => {
  const dir = tmpDir();
  try {
    const sink = createJsonlFileSink(dir);
    const log = createEventLog(sink);
    log.append(makeRecord("x"));
    log.append(makeActivity(3));
    sink.close();

    assert.equal(log.size(), 2);
    const back = readJsonlSink(dir);
    assert.deepEqual(back.map((r) => r.form), ["scar", "cycle-seal"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("segments are daily-named and rotate on the size cap without splitting a record", () => {
  const dir = tmpDir();
  try {
    // a tiny cap forces rotation after every record
    const sink = createJsonlFileSink(dir, { maxSegmentBytes: 700, dateStamp: () => "20260707" });
    sink.write(makeRecord("a"));
    sink.write(makeRecord("b"));
    sink.write(makeRecord("c"));
    sink.close();

    const segs = listSegments(dir);
    assert.ok(segs.length >= 2); // the cap forced overflow segments
    assert.ok(segs[0]!.file.endsWith("event-log-20260707.jsonl"));
    assert.ok(segs[1]!.file.endsWith("event-log-20260707-002.jsonl"));
    // every line is a whole record; the chain verifies across segments
    const v = verifyJsonlSink(dir);
    assert.ok(v.ok);
    if (v.ok) assert.equal(v.count, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a date change opens a new daily segment and the chain spans both days", () => {
  const dir = tmpDir();
  try {
    let today = "20260707";
    const sink = createJsonlFileSink(dir, { dateStamp: () => today });
    sink.write(makeRecord("a"));
    today = "20260708"; // midnight passes
    sink.write(makeRecord("b"));
    sink.close();

    const segs = listSegments(dir);
    assert.deepEqual(segs.map((s) => s.date), ["20260707", "20260708"]);
    const v = verifyJsonlSink(dir);
    assert.ok(v.ok);
    if (v.ok) assert.equal(v.count, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("createEventLog without a sink stays in-memory only (default for tests)", () => {
  const log = createEventLog();
  log.append(makeRecord("z"));
  assert.equal(log.size(), 1);
});
