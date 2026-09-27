/**
 * The commit repo's snapshot payload as a tree of content-addressed objects
 * (protocol §9; choice 2-(b)).
 *
 * Fixed checks: a state reads back exactly as it was put; two snapshots that
 * share a subtree share its object, so a snapshot costs what changed; an object
 * altered on disk is caught on read (the root's hash still covers the whole
 * state); a value that looks like a reference reads back as itself; and a
 * snapshot written whole before the tree (choice 2-(a)) still reads.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";

import { createDirCommitStore, MIN_OBJECT_BYTES } from "./commit-store.js";

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dil-commit-store-"));
}

/** A grid of 64 rows, each 64 cells: large enough to be an object of its own. */
function grid(fill: number): number[][] {
  return Array.from({ length: 64 }, () => Array.from({ length: 64 }, () => fill));
}

function objects(dir: string): string[] {
  return fs.readdirSync(path.join(dir, "objects"));
}

test("a state reads back exactly as it was put", () => {
  const dir = tmp();
  const store = createDirCommitStore(dir);
  const state = {
    layers: { t5: { windows: { a: [grid(1), grid(2)] } } },
    glob: { params: { appraisalGain: 1 }, cycle: 7 },
    data: [["signal-0-0", { payload: { grids: [grid(3)] }, open: { kind: "frame" } }]],
    small: [1, "two", null, true],
  };
  const hash = store.putState(state);
  assert.deepEqual(store.getState(hash), state);
  assert.ok(objects(dir).length > 0, "the large subtrees are objects of their own");
});

test("two snapshots that share a subtree share its object: a snapshot costs what changed", () => {
  const dir = tmp();
  const store = createDirCommitStore(dir);
  const first = { data: [["a", { g: grid(1) }], ["b", { g: grid(2) }]] };
  const second = { data: [["a", { g: grid(1) }], ["b", { g: grid(2) }], ["c", { g: grid(3) }]] };
  store.putState(first);
  const before = new Set(objects(dir));
  const h2 = store.putState(second);
  const added = objects(dir).filter((name) => !before.has(name));
  // What is new: datum c and its grid, and the data array that now holds it.
  assert.ok(added.length <= 3, `only what changed is stored anew (added ${added.length})`);
  assert.deepEqual(store.getState(h2), second);
});

test("an object altered on disk is caught when the state is read", () => {
  const dir = tmp();
  const store = createDirCommitStore(dir);
  const hash = store.putState({ data: [["a", { g: grid(5) }]] });
  const name = objects(dir)[0]!;
  const file = path.join(dir, "objects", name);
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("5", "6"));
  assert.throws(() => store.getState(hash), /fails its content address/);
});

test("a value that looks like a reference reads back as itself", () => {
  const dir = tmp();
  const store = createDirCommitStore(dir);
  const state = {
    looks: { "#dil-ref": "not a hash" },
    escaped: { "#dil-esc": { "#dil-ref": "x" } },
    big: { "#dil-ref": "y", pad: "z".repeat(MIN_OBJECT_BYTES) },
  };
  assert.deepEqual(store.getState(store.putState(state)), state);
});

test("a snapshot written whole, before the tree, still reads", () => {
  const dir = tmp();
  const store = createDirCommitStore(dir);
  const legacy = { data: [["a", { g: grid(9) }]], glob: { cycle: 3 } };
  const text = JSON.stringify(legacy);
  const hash = createHash("sha256").update(text, "utf8").digest("hex");
  fs.writeFileSync(path.join(dir, "state", `${hash}.json`), text);
  assert.deepEqual(store.getState(hash), legacy);
});
