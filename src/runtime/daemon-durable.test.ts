/**
 * Smoke test — Bước 1.5 sub-step (d2): the durable daemon (requisition at startup).
 *
 * When the host declares a substrate (store.root), daemon.start() requisitions it
 * — imposes DIL's store law, scans pre-existing host memory into `prior`, and
 * runs over durable [data] (SQLite) + [event] (disk). The store-of-record is the
 * host's physical memory, never RAM.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { createDaemon } from "./daemon.js";
import { scriptedSource } from "./host-source.js";
import { createGlobMod } from "../loop/glob-mod.js";
import {
  createT1, createT2, createT3, createT4, createT5, createT6, createT7, createT8,
} from "../loop/layers/index.js";
import { layoutFor } from "../store/substrate.js";
import { readLogRecords, verifyJsonlSink } from "../store/event-sink.js";
import type { HostDeclaration } from "../host/declaration.js";
import type { HostCycleInput } from "../loop/cycle.js";

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dil-daemon-durable-"));
}
function sig(entity: string, value: unknown) {
  return { source_id: "ch", raw_payload: { entity, value }, t: 1 };
}
function layers() {
  return {
    t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
    t5: createT5(), t6: createT6(), t7: createT7(), t8: createT8(),
  };
}

test("a substrate-backed daemon requisitions at startup and records [event] on disk", () => {
  const root = tmpRoot();
  try {
    const host: HostDeclaration = {
      boundary: { present: true },
      channels: [{ id: "ch", canReturn: true }],
      store: {
        persistsAcrossCycles: true,
        root,
        preexisting: {
          scan: () => [
            { id: "seed", payload: { note: "prior fact" }, open: { domain: "note", kind: "text", source: "host" } },
          ],
        },
      },
      trace: { externallyReadable: true },
      emitter: { canEmitFirstAction: true },
      resilience: { wipesStateOnMismatch: false },
    };
    const inputs: HostCycleInput[] = [];
    for (let i = 0; i < 5; i++) {
      inputs.push({ signals: [sig("weather", i % 2 ? "rain" : "sun")], changes: [] });
    }
    // No in-memory data/events fixture: the daemon builds durable stores itself.
    const daemon = createDaemon({
      host,
      source: scriptedSource(inputs),
      layers: layers(),
      glob: createGlobMod({ appraisalGain: 1 }, 0),
      initialEmission: { action: "boot" },
    });

    const gate = daemon.start();
    assert.equal(gate.outcome, "qualify");
    // Pre-existing host content was admitted as `prior` at startup.
    assert.equal(daemon.requisitionReport()!.admitted, 1);

    daemon.run();
    assert.equal(daemon.cyclesRun(), 5);
    daemon.close();

    // The store-of-record is on the substrate: DIL-CLAIM + a SQLite [data] file +
    // a hash-chained [event] log, all under the host's directory.
    const layout = layoutFor(root);
    assert.ok(fs.existsSync(layout.claimFile), "DIL-CLAIM written");
    assert.ok(fs.existsSync(path.join(layout.memory, "data.sqlite")), "[data] SQLite on disk");

    const records = readLogRecords(layout.eventLog);
    assert.ok(records.length >= 5, "activity + scars recorded on disk");
    assert.ok(records.some((r) => r.kind === "scar"), "collisions recorded as scars");
    assert.equal(verifyJsonlSink(layout.eventLog).ok, true, "the [event] chain verifies");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a substrate-backed daemon resumes prior [event] records on reopen (INV-5)", () => {
  const root = tmpRoot();
  try {
    const host: HostDeclaration = {
      boundary: { present: true },
      channels: [{ id: "ch", canReturn: true }],
      store: { persistsAcrossCycles: true, root },
      trace: { externallyReadable: true },
      emitter: { canEmitFirstAction: true },
      resilience: { wipesStateOnMismatch: false },
    };
    const run = (n: number) => {
      const d = createDaemon({
        host,
        source: scriptedSource(
          Array.from({ length: n }, (_, i) => ({ signals: [sig("w", i % 2 ? "rain" : "sun")], changes: [] })),
        ),
        layers: layers(),
        glob: createGlobMod({ appraisalGain: 1 }, 0),
        initialEmission: { action: "boot" },
      });
      d.start();
      d.run();
      d.close();
    };
    run(3);
    const after1 = readLogRecords(layoutFor(root).eventLog).length;
    run(3);
    const after2 = readLogRecords(layoutFor(root).eventLog).length;
    assert.ok(after2 > after1, "the [event] log kept growing across restarts, never rolled back");
    assert.equal(verifyJsonlSink(layoutFor(root).eventLog).ok, true, "one chain across restarts");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
