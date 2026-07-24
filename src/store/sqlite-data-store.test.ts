/**
 * Smoke test — Bước 1.5 sub-step (b): SQLite-backed [data] store.
 *
 * The durable [data] representation DIL imposes on the substrate. Verifies the
 * DataStore contract over node:sqlite: round-trip of a full TaggedDatum, mutable
 * overwrite (the present, overwritten each cycle), delete/clear/size, and that
 * entries() preserves insertion order across updates.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createSqliteDataStore } from "./sqlite-data-store.js";
import { admitHostData } from "./tagging-gate.js";
import { toRunning } from "./data-store.js";
import type { TaggedDatum } from "./tags.js";

const open = { domain: "cycle", phase: "loop", source: "test" };

function datum(payload: unknown, cycle: number): TaggedDatum {
  return toRunning(admitHostData({ payload, admittingLayer: 1, open }, cycle), cycle);
}

test("sqlite [data]: put/get round-trips a full TaggedDatum with its tags", () => {
  const store = createSqliteDataStore(":memory:");
  const d = datum({ signals: 2 }, 3);
  store.put("cycle-3", d);

  const back = store.get("cycle-3");
  assert.ok(back);
  assert.deepEqual(back.payload, { signals: 2 });
  assert.equal(back.fixed.provenance, "running");
  assert.equal(back.fixed.cycleMark, 3);
  assert.equal(back.open.domain, "cycle");
  store.close();
});

test("sqlite [data]: put overwrites (mutable present), has/delete/clear/size", () => {
  const store = createSqliteDataStore(":memory:");
  store.put("k", datum({ v: 1 }, 0));
  store.put("k", datum({ v: 2 }, 1)); // overwrite
  assert.equal(store.size(), 1);
  assert.equal(store.has("k"), true);
  assert.deepEqual(store.get("k")!.payload, { v: 2 });

  assert.equal(store.delete("k"), true);
  assert.equal(store.delete("k"), false); // already gone
  assert.equal(store.has("k"), false);

  store.put("a", datum({}, 0));
  store.put("b", datum({}, 0));
  assert.equal(store.size(), 2);
  store.clear();
  assert.equal(store.size(), 0);
  store.close();
});

test("sqlite [data]: entries() preserves insertion order across updates", () => {
  const store = createSqliteDataStore(":memory:");
  store.put("first", datum({ n: 1 }, 0));
  store.put("second", datum({ n: 2 }, 1));
  store.put("third", datum({ n: 3 }, 2));
  store.put("first", datum({ n: 10 }, 3)); // update keeps position

  const keys = store.entries().map(([k]) => k);
  assert.deepEqual(keys, ["first", "second", "third"]);
  assert.deepEqual(store.get("first")!.payload, { n: 10 });
  store.close();
});

test("sqlite [data]: get on a missing key is undefined", () => {
  const store = createSqliteDataStore(":memory:");
  assert.equal(store.get("nope"), undefined);
  assert.equal(store.has("nope"), false);
  store.close();
});
