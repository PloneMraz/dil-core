/**
 * Smoke test — tamper-evidence of the [event] sink (hash chain).
 *
 * Fixed checks: an intact directory verifies with a stable head; ANY altered,
 * removed, inserted, or reordered line is detected at the break point; the
 * chain resumes across a reopen (restart-append) and still verifies; opening a
 * sink on a corrupt tail refuses rather than appending past the evidence.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { createJsonlFileSink, verifyJsonlSink, readChainedLines, listSegments } from "./event-sink.js";
import { CHAIN_GENESIS, chainNext } from "./hash-chain.js";
import { admitHostData } from "./tagging-gate.js";
import { toRunning, toScar, stampLayer } from "./data-store.js";
import { recordScar, type EventRecord, type ContextAnchor } from "./resist-event.js";
import { CONTEXT_ANCHOR_DEPTH } from "./decisions.js";

const open = { domain: "weather", format: "json", platform: "cli" };
const anchor: ContextAnchor = { depth: CONTEXT_ANCHOR_DEPTH, cycle: 2, fieldState: {} };

function makeRecord(source_id: string, received: string): EventRecord {
  let d = admitHostData({ payload: "obs", admittingLayer: 1, open }, 1);
  d = toRunning(d, 2);
  d = stampLayer(d, 7);
  d = toScar(d, true);
  return recordScar(
    d,
    { source_id, expected: "sun", received, mismatch_kind: "value-mismatch", t: 2 },
    anchor,
  );
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dil-chain-"));
}

/** The single segment file after a small same-day run. */
function onlySegment(dir: string): string {
  const segs = listSegments(dir);
  assert.equal(segs.length, 1);
  return segs[0]!.file;
}

function writeThree(dir: string): void {
  const sink = createJsonlFileSink(dir);
  sink.write(makeRecord("a", "rain"));
  sink.write(makeRecord("b", "snow"));
  sink.write(makeRecord("c", "hail"));
  sink.close();
}

test("an intact chained directory verifies, with a 64-hex head", () => {
  const dir = tmpDir();
  try {
    writeThree(dir);
    const v = verifyJsonlSink(dir);
    assert.ok(v.ok);
    if (v.ok) {
      assert.equal(v.count, 3);
      assert.match(v.head, /^[0-9a-f]{64}$/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("altering one byte of a middle line is detected at that line", () => {
  const dir = tmpDir();
  try {
    writeThree(dir);
    const file = onlySegment(dir);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace('"snow"', '"SNOW"'));
    const v = verifyJsonlSink(dir);
    assert.ok(!v.ok);
    if (!v.ok) {
      assert.equal(v.atLine, 1);
      assert.ok(v.reason.includes("content break"));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("removing a line is detected (sequence break)", () => {
  const dir = tmpDir();
  try {
    writeThree(dir);
    const file = onlySegment(dir);
    const lines = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.length > 0);
    fs.writeFileSync(file, [lines[0], lines[2]].join("\n") + "\n");
    const v = verifyJsonlSink(dir);
    assert.ok(!v.ok);
    if (!v.ok) assert.equal(v.atLine, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("reordering two lines is detected", () => {
  const dir = tmpDir();
  try {
    writeThree(dir);
    const file = onlySegment(dir);
    const lines = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.length > 0);
    fs.writeFileSync(file, [lines[1], lines[0], lines[2]].join("\n") + "\n");
    const v = verifyJsonlSink(dir);
    assert.ok(!v.ok);
    if (!v.ok) assert.equal(v.atLine, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a forged appended line with a wrong prev is detected", () => {
  const dir = tmpDir();
  try {
    writeThree(dir);
    const file = onlySegment(dir);
    const forged = chainNext("f".repeat(64), 3, {
      form: "scar",
      timestamp: 1, cycleMark: 2, provenance: "scar", floorTag: 7,
      open, payload: "forged",
      event: { source_id: "x", expected: 1, received: 2, mismatch_kind: "value-mismatch", t: 9 },
      anchor,
    });
    fs.appendFileSync(file, JSON.stringify(forged) + "\n");
    const v = verifyJsonlSink(dir);
    assert.ok(!v.ok);
    if (!v.ok) {
      assert.equal(v.atLine, 3);
      assert.ok(v.reason.includes("chain break"));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the chain resumes across a reopen and still verifies as one chain", () => {
  const dir = tmpDir();
  try {
    const sink1 = createJsonlFileSink(dir);
    sink1.write(makeRecord("a", "rain"));
    const headAfterOne = sink1.head();
    sink1.close();

    const sink2 = createJsonlFileSink(dir); // restart: resumes, never truncates
    assert.equal(sink2.head(), headAfterOne); // picked the chain up where it stood
    sink2.write(makeRecord("b", "snow"));
    sink2.close();

    const v = verifyJsonlSink(dir);
    assert.ok(v.ok);
    if (v.ok) assert.equal(v.count, 2);
    const lines = readChainedLines(dir);
    assert.equal(lines[1]!.prev, headAfterOne); // restart line chains to the pre-restart head
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an empty sink has the genesis head and verifies vacuously", () => {
  const dir = tmpDir();
  try {
    const sink = createJsonlFileSink(dir);
    assert.equal(sink.head(), CHAIN_GENESIS);
    sink.close();
    const v = verifyJsonlSink(dir);
    assert.ok(v.ok);
    if (v.ok) assert.equal(v.count, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("opening a sink on an unparsable tail refuses rather than appending past corruption", () => {
  const dir = tmpDir();
  try {
    writeThree(dir);
    fs.appendFileSync(onlySegment(dir), "not json at all\n");
    assert.throws(() => createJsonlFileSink(dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
