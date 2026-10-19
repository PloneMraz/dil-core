/**
 * SYNC_CADENCE (DECIDE@IMPL tag F): the store synced to disk each record (the
 * default) or once a cycle, a host's declaration. Once a cycle, `[data]`'s
 * writes go in one transaction, committed on `sync()`, and each `[event]` record
 * is still written to its file as it comes — the log still append-only and
 * hash-chained. A daemon declared so syncs at each cycle's close.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { createSqliteDataStore } from "./sqlite-data-store.js";
import { readLogRecords, verifyJsonlSink } from "./event-sink.js";
import { admitHostData } from "./tagging-gate.js";
import { toRunning } from "./data-store.js";
import { SYNC_CADENCE } from "./decisions.js";
import { layoutFor } from "./substrate.js";
import type { TaggedDatum } from "./tags.js";
import { createDaemon } from "../runtime/daemon.js";
import { scriptedSource } from "../runtime/host-source.js";
import { createGlobMod } from "../loop/glob-mod.js";
import {
  createT1, createT2, createT3, createT4, createT5, createT6, createT7, createT8,
} from "../loop/layers/index.js";
import type { HostDeclaration } from "../host/declaration.js";
import type { HostCycleInput } from "../loop/cycle.js";

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dil-sync-cadence-"));
}

function datum(payload: unknown, cycle: number): TaggedDatum {
  return toRunning(
    admitHostData({ payload, admittingLayer: 1, open: { domain: "cycle", phase: "loop", source: "test" } }, cycle),
    cycle,
  );
}

function rowsSeenFromOutside(file: string): number {
  const other = new DatabaseSync(file);
  try {
    return Number((other.prepare("SELECT count(*) AS n FROM data").get() as { n: number | bigint }).n);
  } finally {
    other.close();
  }
}

test("the declared default syncs each record", () => {
  assert.equal(SYNC_CADENCE, "record");
});

test("sqlite [data] by default commits each write: another connection sees it at once", () => {
  const dir = tmp();
  try {
    const file = path.join(dir, "data.sqlite");
    const store = createSqliteDataStore(file);
    store.put("a", datum({ n: 1 }, 0));
    assert.equal(rowsSeenFromOutside(file), 1);
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sqlite [data] once a cycle: a cycle's writes are one transaction, committed on sync()", () => {
  const dir = tmp();
  try {
    const file = path.join(dir, "data.sqlite");
    const store = createSqliteDataStore(file);
    store.syncEachCycle();
    store.put("a", datum({ n: 1 }, 0));
    store.put("b", datum({ n: 2 }, 0));
    assert.equal(store.size(), 2, "its own reads see every write");
    assert.equal(rowsSeenFromOutside(file), 0, "not committed before the cycle's close");
    store.sync();
    assert.equal(rowsSeenFromOutside(file), 2, "committed at the cycle's close");
    store.put("c", datum({ n: 3 }, 1));
    store.close(); // what is left is committed on close
    assert.equal(rowsSeenFromOutside(file), 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function layers() {
  return {
    t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
    t5: createT5(), t6: createT6(), t7: createT7(), t8: createT8(),
  };
}

function hostAt(root: string): HostDeclaration {
  return {
    boundary: { present: true },
    channels: [{ id: "ch", canReturn: true }],
    store: { persistsAcrossCycles: true, root },
    trace: { externallyReadable: true },
    emitter: { canEmitFirstAction: true },
    resilience: { wipesStateOnMismatch: false },
  };
}

test("a daemon declared to sync once a cycle leaves each cycle on disk at its close", () => {
  const root = tmp();
  try {
    const inputs: HostCycleInput[] = [];
    for (let i = 0; i < 4; i++) {
      inputs.push({ signals: [{ source_id: "ch", raw_payload: { entity: "w", value: i }, t: 1 }], changes: [] });
    }
    const daemon = createDaemon({
      host: hostAt(root),
      source: scriptedSource(inputs),
      layers: layers(),
      glob: createGlobMod({ appraisalGain: 1 }, 0),
      initialEmission: { action: "boot" },
      syncCadence: "cycle",
    });
    assert.equal(daemon.start().outcome, "qualify");
    daemon.run(2);
    // Two cycles closed: their [data] committed, seen from another connection.
    const file = path.join(layoutFor(root).memory, "data.sqlite");
    assert.ok(rowsSeenFromOutside(file) >= 2, "each closed cycle's data is committed");
    assert.ok(readLogRecords(layoutFor(root).eventLog).length >= 2, "each record written to its file as it came");
    daemon.run();
    daemon.close();
    assert.equal(verifyJsonlSink(layoutFor(root).eventLog).ok, true, "the [event] chain verifies");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
