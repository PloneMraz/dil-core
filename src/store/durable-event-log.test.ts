/**
 * Smoke test — Bước 1.5 sub-step (c): durable [event] log (disk = source of truth).
 *
 * The [event] log's source of truth is the substrate: records read back from
 * disk (deserialized), RAM holds only a counter + chain head. Verifies the
 * serialize→disk→deserialize round-trip is lossless, that a reopened log resumes
 * the prior records and chain, and that bySourceId reads scars from disk.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { createDurableEventLog } from "./event-log.js";
import { serializeEventRecord, deserializeEventRecord } from "./event-sink.js";
import { recordScar, recordActivity, type ContextAnchor } from "./resist-event.js";
import { admitHostData } from "./tagging-gate.js";
import { toRunning, toScar, stampLayer } from "./data-store.js";
import type { TaggedDatum } from "./tags.js";

const open = { domain: "cycle", phase: "loop", source: "test" };
const anchor: ContextAnchor = { depth: "full-field-state", cycle: 0, fieldState: { g: 1 } };

function ran(cycle: number): TaggedDatum {
  let d = toRunning(admitHostData({ payload: { cycle }, admittingLayer: 1, open }, cycle), cycle);
  for (let l = 1 as const; l <= 8; l++) d = stampLayer(d, l as 1);
  return d;
}
function scarRec(cycle: number, source_id: string) {
  const scar = toScar(ran(cycle), true);
  return recordScar(
    scar,
    { source_id, expected: "a", received: "b", mismatch_kind: "value-mismatch", t: cycle },
    { ...anchor, cycle },
  );
}
function activityRec(cycle: number) {
  return recordActivity(
    `cycle-${cycle}`,
    ran(cycle),
    { cycle, flow: "single-threaded", emitted: { kind: "respond" }, observed: ["e"], scars: 1, t: cycle },
    { ...anchor, cycle },
  );
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dil-eventlog-"));
}

test("durable [event]: serialize→deserialize round-trips a record losslessly", () => {
  const rec = scarRec(3, "weather");
  const back = deserializeEventRecord(serializeEventRecord(rec));
  assert.deepEqual(back, rec);
});

test("durable [event]: records read back from disk; size() is a counter", () => {
  const dir = tmpDir();
  const log = createDurableEventLog(dir);
  log.append(scarRec(0, "weather"));
  log.append(activityRec(0));
  assert.equal(log.size(), 2);

  const all = log.all();
  assert.equal(all.length, 2);
  assert.equal(all[0]!.kind, "scar");
  assert.equal(all[1]!.kind, "activity");
  log.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("durable [event]: a reopened log resumes prior records and the chain", () => {
  const dir = tmpDir();
  const first = createDurableEventLog(dir);
  first.append(scarRec(0, "a"));
  first.append(activityRec(0));
  const headAfterFirst = first.head();
  first.close();

  const second = createDurableEventLog(dir);
  assert.equal(second.size(), 2, "counter resumes from the substrate");
  second.append(activityRec(1));
  assert.equal(second.size(), 3);
  assert.notEqual(second.head(), headAfterFirst, "chain advanced from the resumed head");
  assert.equal(second.all().length, 3);
  second.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("durable [event]: bySourceId reads matching scars from disk", () => {
  const dir = tmpDir();
  const log = createDurableEventLog(dir);
  log.append(scarRec(0, "weather"));
  log.append(scarRec(1, "market"));
  log.append(scarRec(2, "weather"));
  log.append(activityRec(2));

  assert.equal(log.bySourceId("weather").length, 2);
  assert.equal(log.bySourceId("market").length, 1);
  assert.equal(log.bySourceId("none").length, 0);
  log.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
