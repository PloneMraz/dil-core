/**
 * Smoke test — the §9 commit/snapshot/recovery mechanism.
 *
 * Fixed checks: a commit fires on the scar rhythm at a cycle boundary; markers
 * are content-addressed, parent-linked (a DAG) and write-once; recovery
 * restores the FULL accrued state (proved behaviourally: restored expectations
 * predict correctly, so no false scar); the [event] log is NEVER rolled back —
 * it keeps recording through a recovery; and the fork marker stamps the
 * rollback into the DAG (parent = recoveredFrom).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { createDaemon, type DaemonDeps } from "./daemon.js";
import { scriptedSource } from "./host-source.js";
import { createDirCommitStore } from "../store/commit-store.js";
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
import { createEventLog, type EventLog } from "../store/event-log.js";
import type { HostDeclaration } from "../host/declaration.js";
import type { HostCycleInput, Layers } from "../loop/cycle.js";

const host: HostDeclaration = {
  boundary: { present: true },
  channels: [{ id: "ch", canReturn: true }],
  store: { persistsAcrossCycles: true },
  trace: { externallyReadable: true },
  emitter: { canEmitFirstAction: true },
  resilience: { wipesStateOnMismatch: false },
};

function sig(entity: string, value: unknown) {
  return { source_id: "ch", raw_payload: { entity, value }, t: 1 };
}

function freshLayers(): Layers {
  return {
    t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
    t5: createT5(), t6: createT6(), t7: createT7(), t8: createT8(),
  };
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dil-commits-"));
}

function makeDaemon(
  inputs: readonly HostCycleInput[],
  opts: { commitsDir?: string; commitEvery?: number; events?: EventLog; recoverFrom?: string } = {},
) {
  const events = opts.events ?? createEventLog();
  const commits = opts.commitsDir ? createDirCommitStore(opts.commitsDir) : undefined;
  const deps: DaemonDeps = {
    host,
    source: scriptedSource(inputs),
    layers: freshLayers(),
    glob: createGlobMod({ appraisalGain: 1 }, 0),
    data: createDataStore(),
    events,
    initialEmission: { action: "boot" },
    ...(commits ? { commits } : {}),
    ...(opts.commitEvery !== undefined ? { commitEvery: opts.commitEvery } : {}),
    ...(opts.recoverFrom !== undefined ? { recoverFrom: opts.recoverFrom } : {}),
  };
  return { daemon: createDaemon(deps), events, commits };
}

/** Inputs where 'weather' alternates → a scar every cycle after the first. */
function alternating(n: number): HostCycleInput[] {
  return Array.from({ length: n }, (_, i) => ({
    signals: [sig("weather", i % 2 ? "rain" : "sun")],
    changes: [],
  }));
}

test("a commit fires automatically after COMMIT_EVERY scars, at a cycle boundary", () => {
  const dir = tmpDir();
  try {
    const { daemon, commits } = makeDaemon(alternating(8), { commitsDir: dir, commitEvery: 3 });
    daemon.start();
    daemon.run();
    // 7 scars over 8 cycles → commits at scar 3 and 6 → 2 markers
    assert.equal(commits!.list().length, 2);
    const head = commits!.getMarker(commits!.head()!);
    assert.equal(head.scarCount, 6);
    assert.ok(head.stateHash.length === 64);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("markers are parent-linked into a DAG and content-addressed (tamper self-evident)", () => {
  const dir = tmpDir();
  try {
    const { daemon, commits } = makeDaemon(alternating(8), { commitsDir: dir, commitEvery: 3 });
    daemon.start();
    daemon.run();
    const headHash = commits!.head()!;
    const head = commits!.getMarker(headHash);
    assert.ok(head.parent !== null);
    const first = commits!.getMarker(head.parent!);
    assert.equal(first.parent, null); // the genesis commit
    // tamper the head marker file → its content no longer matches its name
    const file = path.join(dir, `${headHash}.json`);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace('"scarCount":6', '"scarCount":1'));
    assert.throws(() => commits!.getMarker(headHash), /fails its content address/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("manual commit() works without waiting for the rhythm", () => {
  const dir = tmpDir();
  try {
    const { daemon, commits } = makeDaemon(alternating(2), { commitsDir: dir, commitEvery: 99 });
    daemon.start();
    daemon.run();
    assert.equal(commits!.list().length, 0); // rhythm never reached
    const hash = daemon.commit(); // out-of-loop trigger
    assert.ok(hash);
    assert.equal(commits!.head(), hash);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("recovery restores the accrued learning: the restored expectation predicts, no false scar", () => {
  const dir = tmpDir();
  try {
    // Daemon A learns 'weather'→"sun" (stable), then commits manually.
    const events = createEventLog();
    const a = makeDaemon(
      [
        { signals: [sig("weather", "sun")], changes: [] },
        { signals: [sig("weather", "sun")], changes: [] },
        { signals: [sig("weather", "sun")], changes: [] },
      ],
      { commitsDir: dir, events },
    );
    a.daemon.start();
    a.daemon.run();
    const marker = a.daemon.commit()!;
    const cyclesAtCommit = a.daemon.cyclesRun();

    // Daemon B: FRESH layers/glob/data, recovered from the marker, same log.
    const b = makeDaemon(
      [{ signals: [sig("weather", "sun")], changes: [] }],
      { commitsDir: dir, events, recoverFrom: marker },
    );
    b.daemon.start();
    assert.equal(b.daemon.cyclesRun(), cyclesAtCommit); // resumed, not reset
    b.daemon.run();
    // The restored T5 window predicts "sun" → the same return collides nothing.
    assert.equal(b.daemon.lastResult()!.scars, 0);
    assert.equal(b.daemon.lastResult()!.flow, "multi-stream"); // resumed past cycle-0
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("rollback undoes the LEARNING but never the LOG; the fork marker stamps the DAG", () => {
  const dir = tmpDir();
  try {
    const events = createEventLog();
    // Daemon A: learn sun (3 cycles), commit → then get "poisoned" to rain.
    const a = makeDaemon(
      [
        { signals: [sig("weather", "sun")], changes: [] },
        { signals: [sig("weather", "sun")], changes: [] },
        { signals: [sig("weather", "sun")], changes: [] },
      ],
      { commitsDir: dir, events },
    );
    a.daemon.start();
    a.daemon.run();
    const clean = a.daemon.commit()!; // the clean restore point
    const b = makeDaemon(
      [
        { signals: [sig("weather", "rain")], changes: [] }, // the "wrong" mismatch
        { signals: [sig("weather", "rain")], changes: [] }, // learned rain now
      ],
      { commitsDir: dir, events, recoverFrom: clean },
    );
    // (recoverFrom: clean here doubles as "continue A from its commit")
    b.daemon.start();
    b.daemon.run();
    const logAfterPoison = events.size();
    assert.ok(logAfterPoison > 0);

    // Third party judges the rain episode poisoned → roll back to `clean`.
    const c = makeDaemon(
      [{ signals: [sig("weather", "sun")], changes: [] }],
      { commitsDir: dir, events, recoverFrom: clean },
    );
    c.daemon.start();
    // The [event] log was NOT rolled back — every record is still there…
    assert.equal(events.size(), logAfterPoison);
    // …the fork is stamped into the DAG…
    const fork = c.commits!.getMarker(c.commits!.head()!);
    assert.equal(fork.recoveredFrom, clean);
    assert.equal(fork.parent, clean);
    // …and the poisoned learning is gone: sun predicts again, no scar.
    c.daemon.run();
    assert.equal(c.daemon.lastResult()!.scars, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("without a commit store no commits fire and commit() returns null", () => {
  const { daemon } = makeDaemon(alternating(4));
  daemon.start();
  daemon.run();
  assert.equal(daemon.commit(), null);
});
