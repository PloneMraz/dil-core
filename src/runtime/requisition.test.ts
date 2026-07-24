/**
 * Smoke test — Bước 1.5 sub-step (d1): requisition + scan/admit-as-prior.
 *
 * DIL imposes its store law on the host's substrate at startup: claims the
 * substrate, binds durable [data]/[event]/commits, and scans the host's
 * pre-existing memory, forcing every item through the tagging-gate as `prior`.
 * Nothing enters the store untagged; an unvettable item is rejected, not
 * smuggled in.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { requisition, RequisitionError } from "./requisition.js";
import { SubstrateClaimError } from "../store/substrate.js";
import type { HostDeclaration } from "../host/declaration.js";

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dil-requisition-"));
}

function hostWith(root: string, preexisting?: HostDeclaration["store"]["preexisting"]): HostDeclaration {
  return {
    boundary: { present: true },
    channels: [{ id: "ch", canReturn: true }],
    store: { persistsAcrossCycles: true, root, preexisting },
    trace: { externallyReadable: true },
    emitter: { canEmitFirstAction: true },
    resilience: { wipesStateOnMismatch: false },
  };
}

test("requisition claims the substrate and binds usable durable stores", () => {
  const root = tmpRoot();
  const req = requisition(hostWith(root));

  assert.ok(fs.existsSync(req.layout.claimFile), "substrate claimed");
  assert.equal(req.admitted, 0);
  // stores are usable
  assert.equal(req.data.size(), 0);
  assert.equal(req.events.size(), 0);
  req.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test("pre-existing host content is admitted as `prior` through the gate", () => {
  const root = tmpRoot();
  const preexisting = {
    scan: () => [
      { id: "note-1", payload: { text: "hello" }, open: { domain: "note", kind: "text", source: "host" } },
      { id: "note-2", payload: { text: "world" }, open: { domain: "note", kind: "text", source: "host" } },
    ],
  };
  const req = requisition(hostWith(root, preexisting));

  assert.equal(req.admitted, 2);
  assert.equal(req.rejected.length, 0);
  const d1 = req.data.get("note-1");
  assert.ok(d1);
  assert.equal(d1.fixed.provenance, "prior", "admitted as prior");
  assert.equal(d1.fixed.cycleMark, null, "a prior bears no cycle-mark until it has run");
  assert.equal(d1.open.domain, "note");
  req.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test("an item that fails vetting is rejected, not smuggled in (no side door)", () => {
  const root = tmpRoot();
  const preexisting = {
    scan: () => [
      { id: "ok", payload: 1, open: { domain: "note", kind: "text", source: "host" } as Record<string, string> },
      { id: "bad", payload: 2, open: { kind: "text" } as Record<string, string> }, // missing domain, < 3 tags
    ],
  };
  const req = requisition(hostWith(root, preexisting));

  assert.equal(req.admitted, 1);
  assert.equal(req.rejected.length, 1);
  assert.equal(req.rejected[0]!.id, "bad");
  assert.equal(req.data.has("bad"), false, "the untagged item did not enter the store");
  assert.equal(req.data.has("ok"), true);
  req.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test("a host with no substrate cannot be requisitioned", () => {
  const host = hostWith("x");
  const noRoot: HostDeclaration = { ...host, store: { persistsAcrossCycles: true } };
  assert.throws(() => requisition(noRoot), RequisitionError);
});

test("a substrate under a foreign law is refused at requisition", () => {
  const root = tmpRoot();
  const first = requisition(hostWith(root));
  first.close();
  // stamp a foreign claim
  fs.writeFileSync(first.layout.claimFile, JSON.stringify({ protocol: "0.2", tagSchema: 1, layout: 1 }));
  assert.throws(() => requisition(hostWith(root)), SubstrateClaimError);
  fs.rmSync(root, { recursive: true, force: true });
});
