/**
 * Smoke test — the `dil` read-only CLI (cli-run.ts).
 *
 * Exercises `run(argv, out, err)` directly (no process spawn): each command over
 * a real on-disk store, the exit-code contract (0 ok / 1 usage-or-path / 2
 * verification-failed), the usage/help paths, and that the CLI never writes to
 * the store it reads.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { run, USAGE } from "./cli-run.js";
import { layoutFor } from "./store/substrate.js";
import { createJsonlFileSink, listSegments } from "./store/event-sink.js";
import { recordProvenance, recordLayerExit } from "./store/resist-event.js";

/** A capturing output sink. */
function capture(): { s: string; write(x: string): void } {
  return { s: "", write(x: string) { this.s += x; } };
}

/** A fresh temp store root with a small, valid [event] log written to disk. */
function tmpStore(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dil-cli-"));
  const sink = createJsonlFileSink(layoutFor(root).eventLog);
  sink.write(recordProvenance("cycle-0", 0, "prior", "running", 1));
  sink.write(recordLayerExit("cycle-0", 0, 1, 1));
  sink.write(recordLayerExit("cycle-0", 0, 2, 1));
  sink.close();
  return root;
}

/** A temp directory that is NOT a DIL store (no store/event-log/). */
function tmpBareDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dil-bare-"));
}

test("verify: a valid store reports ok with a head, exit 0", () => {
  const root = tmpStore();
  try {
    const out = capture(), err = capture();
    const code = run(["verify", root], out, err);
    assert.equal(code, 0);
    assert.match(out.s, /^ok — 3 record\(s\), head [0-9a-f]{64}/);
    assert.equal(err.s, "");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("verify: a tampered chain reports BROKEN and exits 2", () => {
  const root = tmpStore();
  try {
    const seg = listSegments(layoutFor(root).eventLog)[0]!.file;
    fs.writeFileSync(seg, fs.readFileSync(seg, "utf8").replace("running", "RUNNING"));
    const out = capture(), err = capture();
    const code = run(["verify", root], out, err);
    assert.equal(code, 2);
    assert.match(out.s, /^BROKEN at line \d+:/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("inspect: prints the datum-activity journal, exit 0", () => {
  const root = tmpStore();
  try {
    const out = capture(), err = capture();
    const code = run(["inspect", root], out, err);
    assert.equal(code, 0);
    assert.match(out.s, /\[event-log\] — 3 record\(s\)/);
    assert.match(out.s, /\[layer-exit\] cycle-0 @T1/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("conformance: prints the §13 table, exit 0", () => {
  const root = tmpStore();
  try {
    const out = capture(), err = capture();
    const code = run(["conformance", root], out, err);
    assert.equal(code, 0);
    assert.match(out.s, /Conformance \(§13\)/);
    // no gate is available from disk — §13.2 Host is honestly unverifiable
    assert.match(out.s, /§13\.2 Host conditions/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("no command prints usage and exits 1", () => {
  const out = capture(), err = capture();
  const code = run([], out, err);
  assert.equal(code, 1);
  assert.equal(err.s, USAGE);
});

test("--help prints usage and exits 0", () => {
  const out = capture(), err = capture();
  const code = run(["--help"], out, err);
  assert.equal(code, 0);
  assert.equal(out.s, USAGE);
});

test("an unknown command is refused, exit 1", () => {
  const out = capture(), err = capture();
  const code = run(["bogus"], out, err);
  assert.equal(code, 1);
  assert.match(err.s, /unknown command "bogus"/);
});

test("a missing <store-dir> is a usage error, exit 1", () => {
  const out = capture(), err = capture();
  const code = run(["verify"], out, err);
  assert.equal(code, 1);
  assert.match(err.s, /missing <store-dir>/);
});

test("a nonexistent directory is refused, exit 1", () => {
  const out = capture(), err = capture();
  const code = run(["verify", path.join(os.tmpdir(), "dil-does-not-exist-xyz")], out, err);
  assert.equal(code, 1);
  assert.match(err.s, /no such directory/);
});

test("a directory that is not a DIL store is refused, exit 1", () => {
  const bare = tmpBareDir();
  try {
    const out = capture(), err = capture();
    const code = run(["inspect", bare], out, err);
    assert.equal(code, 1);
    assert.match(err.s, /not a DIL store/);
  } finally {
    fs.rmSync(bare, { recursive: true, force: true });
  }
});

test("the CLI never writes to the store it reads (observer only)", () => {
  const root = tmpStore();
  try {
    const before = fs.readFileSync(listSegments(layoutFor(root).eventLog)[0]!.file, "utf8");
    run(["verify", root], capture(), capture());
    run(["inspect", root], capture(), capture());
    run(["conformance", root], capture(), capture());
    const after = fs.readFileSync(listSegments(layoutFor(root).eventLog)[0]!.file, "utf8");
    assert.equal(after, before, "the [event] log is untouched by any read command");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
