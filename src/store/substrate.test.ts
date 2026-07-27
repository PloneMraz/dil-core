/**
 * Smoke test — Bước 1.5 sub-step (a): substrate claim + DIL-CLAIM.
 *
 * DIL imposes its layout + claim on a raw directory (the host's physical memory):
 *   - a fresh substrate is stamped and laid out;
 *   - a resume with a matching claim is accepted;
 *   - a resume with a foreign/incompatible or corrupt claim is refused (DIL will
 *     not rule a store it did not stamp, or one under a different law).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  DIL_CLAIM,
  claimSubstrate,
  layoutFor,
  SubstrateClaimError,
} from "./substrate.js";

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dil-substrate-"));
}

test("claiming a fresh substrate lays out the three store kinds and writes DIL-CLAIM", () => {
  const root = tmpRoot();
  const layout = claimSubstrate(root);

  assert.ok(fs.existsSync(layout.memory), "memory/ created");
  assert.ok(fs.existsSync(layout.eventLog), "event-log/ created");
  assert.ok(fs.existsSync(layout.commits), "commits/ created");
  assert.ok(fs.existsSync(layout.claimFile), "DIL-CLAIM written");

  const stored = JSON.parse(fs.readFileSync(layout.claimFile, "utf8"));
  assert.equal(stored.protocol, DIL_CLAIM.protocol);
  assert.equal(stored.tagSchema, DIL_CLAIM.tagSchema);
  assert.equal(stored.layout, DIL_CLAIM.layout);

  fs.rmSync(root, { recursive: true, force: true });
});

test("layoutFor resolves canonical paths under store/", () => {
  const layout = layoutFor("/tmp/x");
  assert.match(layout.memory, /store[\\/]memory$/);
  assert.match(layout.eventLog, /store[\\/]event-log$/);
  assert.match(layout.commits, /store[\\/]commits$/);
  assert.match(layout.claimFile, /store[\\/]DIL-CLAIM\.json$/);
});

test("resuming a substrate with a matching claim is accepted (claim not rewritten)", () => {
  const root = tmpRoot();
  const first = claimSubstrate(root);
  const before = fs.readFileSync(first.claimFile, "utf8");

  const second = claimSubstrate(root); // resume
  const after = fs.readFileSync(second.claimFile, "utf8");
  assert.equal(after, before, "an existing matching claim is left untouched");

  fs.rmSync(root, { recursive: true, force: true });
});

test("resuming a substrate with a foreign/incompatible claim is refused", () => {
  const root = tmpRoot();
  const layout = claimSubstrate(root);
  // A store stamped under a different protocol law.
  fs.writeFileSync(
    layout.claimFile,
    JSON.stringify({ protocol: "0.2", tagSchema: 1, layout: 1 }),
  );
  assert.throws(() => claimSubstrate(root), SubstrateClaimError);

  fs.rmSync(root, { recursive: true, force: true });
});

test("a corrupt (unparsable) claim is refused rather than run", () => {
  const root = tmpRoot();
  const layout = claimSubstrate(root);
  fs.writeFileSync(layout.claimFile, "{ not json");
  assert.throws(() => claimSubstrate(root), SubstrateClaimError);

  fs.rmSync(root, { recursive: true, force: true });
});

test("an older stored tag-schema is accepted, and the claim is advanced (policy A)", () => {
  const root = tmpRoot();
  const layout = claimSubstrate(root);
  // a substrate stamped under an OLDER schema (v1, the 3-state provenance era)
  fs.writeFileSync(layout.claimFile, JSON.stringify({ protocol: "0.3.2", tagSchema: 1, layout: 1 }));
  // a newer DIL accepts it — it reads old records by their per-line schemaVersion
  assert.doesNotThrow(() => claimSubstrate(root));
  const advanced = JSON.parse(fs.readFileSync(layout.claimFile, "utf8"));
  assert.equal(advanced.tagSchema, DIL_CLAIM.tagSchema); // claim advanced to current
  fs.rmSync(root, { recursive: true, force: true });
});

test("a newer stored tag-schema is refused — an older DIL must not write it", () => {
  const root = tmpRoot();
  const layout = claimSubstrate(root);
  fs.writeFileSync(layout.claimFile, JSON.stringify({ protocol: "0.3.2", tagSchema: 999, layout: 1 }));
  assert.throws(() => claimSubstrate(root), SubstrateClaimError);
  fs.rmSync(root, { recursive: true, force: true });
});
