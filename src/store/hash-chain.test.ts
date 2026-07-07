/**
 * Smoke test — tamper-evidence of the [event] sink (hash chain).
 *
 * Fixed checks: an intact file verifies with a stable head; ANY altered,
 * removed, inserted, or reordered line is detected at the break point; the
 * chain resumes across a reopen (restart-append) and still verifies; opening a
 * sink on a corrupt tail refuses rather than appending past the evidence.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { createJsonlFileSink, verifyJsonlSink, readChainedLines } from "./event-sink.js";
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

function tmpFile(): string {
  return path.join(os.tmpdir(), `dil-chain-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
}

function writeThree(file: string): void {
  const sink = createJsonlFileSink(file);
  sink.write(makeRecord("a", "rain"));
  sink.write(makeRecord("b", "snow"));
  sink.write(makeRecord("c", "hail"));
  sink.close();
}

test("an intact chained file verifies, with a 64-hex head", () => {
  const file = tmpFile();
  try {
    writeThree(file);
    const v = verifyJsonlSink(file);
    assert.ok(v.ok);
    if (v.ok) {
      assert.equal(v.count, 3);
      assert.match(v.head, /^[0-9a-f]{64}$/);
    }
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("altering one byte of a middle line is detected at that line", () => {
  const file = tmpFile();
  try {
    writeThree(file);
    const tampered = fs.readFileSync(file, "utf8").replace('"snow"', '"SNOW"');
    fs.writeFileSync(file, tampered); // the adversary's edit, not the sink's
    const v = verifyJsonlSink(file);
    assert.ok(!v.ok);
    if (!v.ok) {
      assert.equal(v.atLine, 1);
      assert.ok(v.reason.includes("content break"));
    }
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("removing a line is detected (sequence break)", () => {
  const file = tmpFile();
  try {
    writeThree(file);
    const lines = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.length > 0);
    fs.writeFileSync(file, [lines[0], lines[2]].join("\n") + "\n");
    const v = verifyJsonlSink(file);
    assert.ok(!v.ok);
    if (!v.ok) assert.equal(v.atLine, 1);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("reordering two lines is detected", () => {
  const file = tmpFile();
  try {
    writeThree(file);
    const lines = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.length > 0);
    fs.writeFileSync(file, [lines[1], lines[0], lines[2]].join("\n") + "\n");
    const v = verifyJsonlSink(file);
    assert.ok(!v.ok);
    if (!v.ok) assert.equal(v.atLine, 0);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("a forged appended line with a wrong prev is detected", () => {
  const file = tmpFile();
  try {
    writeThree(file);
    // the forger crafts a structurally valid line but cannot know the real head
    const forged = chainNext("f".repeat(64), 3, {
      timestamp: 1, cycleMark: 2, provenance: "scar", floorTag: 7,
      open, layer_trace: [1, 7], payload: "forged",
      event: { source_id: "x", expected: 1, received: 2, mismatch_kind: "value-mismatch", t: 9 },
      anchor,
    });
    fs.appendFileSync(file, JSON.stringify(forged) + "\n");
    const v = verifyJsonlSink(file);
    assert.ok(!v.ok);
    if (!v.ok) {
      assert.equal(v.atLine, 3);
      assert.ok(v.reason.includes("chain break"));
    }
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("the chain resumes across a reopen and still verifies as one chain", () => {
  const file = tmpFile();
  try {
    const sink1 = createJsonlFileSink(file);
    sink1.write(makeRecord("a", "rain"));
    const headAfterOne = sink1.head();
    sink1.close();

    const sink2 = createJsonlFileSink(file); // restart: resumes, never truncates
    assert.equal(sink2.head(), headAfterOne); // picked the chain up where it stood
    sink2.write(makeRecord("b", "snow"));
    sink2.close();

    const v = verifyJsonlSink(file);
    assert.ok(v.ok);
    if (v.ok) assert.equal(v.count, 2);
    const lines = readChainedLines(file);
    assert.equal(lines[1]!.prev, headAfterOne); // restart line chains to the pre-restart head
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("an empty sink has the genesis head and verifies vacuously", () => {
  const file = tmpFile();
  try {
    const sink = createJsonlFileSink(file);
    assert.equal(sink.head(), CHAIN_GENESIS);
    sink.close();
    const v = verifyJsonlSink(file);
    assert.ok(v.ok);
    if (v.ok) assert.equal(v.count, 0);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("opening a sink on an unparsable tail refuses rather than appending past corruption", () => {
  const file = tmpFile();
  try {
    writeThree(file);
    fs.appendFileSync(file, "not json at all\n");
    assert.throws(() => createJsonlFileSink(file));
  } finally {
    fs.rmSync(file, { force: true });
  }
});
