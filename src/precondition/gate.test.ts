/**
 * Smoke test — Stage 1, the precondition gate (AGENTS.md "Build & Test").
 *
 * The fixed check this stage must satisfy: a non-qualifying host declaration
 * yields a *clean non-start*, not a degraded run. These cases pin that down
 * condition by condition, plus the two design properties that bite:
 *   - P(b) is E3 restated (a store that does not persist fails both);
 *   - the gate evaluates all conditions before deciding (no short-circuit).
 *
 * Uses node:test (built-in) — no added dependency.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { checkPrecondition, type GateResult } from "./gate.js";
import type { HostDeclaration } from "../host/declaration.js";

/** A fully valid host. Bad cases override exactly one field. */
function validHost(): HostDeclaration {
  return {
    boundary: { present: true },
    channels: [{ id: "ch0", canReturn: true }],
    store: { persistsAcrossCycles: true },
    trace: { externallyReadable: true },
    emitter: { canEmitFirstAction: true },
    resilience: { wipesStateOnMismatch: false },
  };
}

/** Assert non-start and return the failed-condition list. */
function expectNonStart(result: GateResult): readonly string[] {
  assert.equal(result.outcome, "non-start");
  if (result.outcome !== "non-start") throw new Error("unreachable");
  return result.failed;
}

// 1 — fully valid host qualifies; every check passed.
test("valid host qualifies with all checks passed", () => {
  const result = checkPrecondition(validHost());
  assert.equal(result.outcome, "qualify");
  assert.ok(result.checks.every((c) => c.passed));
  assert.equal(result.checks.length, 7);
});

// 2 — E1 missing boundary.
test("missing boundary fails E1 (clean non-start)", () => {
  const host = { ...validHost(), boundary: { present: false } };
  const failed = expectNonStart(checkPrecondition(host));
  assert.ok(failed.includes("E1"));
});

// 3 — E2 void field: zero channels.
test("zero channels is a void field, fails E2", () => {
  const host = { ...validHost(), channels: [] };
  const failed = expectNonStart(checkPrecondition(host));
  assert.ok(failed.includes("E2"));
});

// 4 — E2 void field: channels present but all silent.
test("all-silent channels is a void field, fails E2", () => {
  const host: HostDeclaration = {
    ...validHost(),
    channels: [
      { id: "a", canReturn: false },
      { id: "b", canReturn: false },
    ],
  };
  const failed = expectNonStart(checkPrecondition(host));
  assert.ok(failed.includes("E2"));
});

// 5 — E2 passes with at least one returning channel (single silence is valid).
test("one returning channel satisfies E2 even amid silence", () => {
  const host: HostDeclaration = {
    ...validHost(),
    channels: [
      { id: "a", canReturn: false },
      { id: "b", canReturn: true },
    ],
  };
  const result = checkPrecondition(host);
  const e2 = result.checks.find((c) => c.id === "E2");
  assert.ok(e2?.passed);
});

// 6 — E3 failure also fails P(b): P(b) is E3 restated for bootstrap.
test("no cross-cycle persistence fails both E3 and P_b", () => {
  const host = { ...validHost(), store: { persistsAcrossCycles: false } };
  const failed = expectNonStart(checkPrecondition(host));
  assert.ok(failed.includes("E3"));
  assert.ok(failed.includes("P_b"));
});

// 7 — E4 no observable trace.
test("no externally readable trace fails E4", () => {
  const host = { ...validHost(), trace: { externallyReadable: false } };
  const failed = expectNonStart(checkPrecondition(host));
  assert.ok(failed.includes("E4"));
});

// 8 — P(a) cannot emit first action.
test("cannot emit a first action fails P_a", () => {
  const host = { ...validHost(), emitter: { canEmitFirstAction: false } };
  const failed = expectNonStart(checkPrecondition(host));
  assert.ok(failed.includes("P_a"));
});

// 9 — P(c) self-wipe-on-mismatch defect.
test("self-wipe on mismatch fails P_c", () => {
  const host = {
    ...validHost(),
    resilience: { wipesStateOnMismatch: true },
  };
  const failed = expectNonStart(checkPrecondition(host));
  assert.ok(failed.includes("P_c"));
});

// 10 — multiple defects: the gate reports ALL failures, not just the first.
test("gate evaluates all conditions and reports every failure", () => {
  const host: HostDeclaration = {
    boundary: { present: false }, // E1
    channels: [], // E2
    store: { persistsAcrossCycles: false }, // E3 + P_b
    trace: { externallyReadable: false }, // E4
    emitter: { canEmitFirstAction: false }, // P_a
    resilience: { wipesStateOnMismatch: true }, // P_c
  };
  const result = checkPrecondition(host);
  const failed = expectNonStart(result);
  // every one of the seven conditions should be reported failed
  for (const id of ["E1", "E2", "E3", "E4", "P_a", "P_b", "P_c"]) {
    assert.ok(failed.includes(id as never), `expected ${id} in failed`);
  }
  // and the full check list is still complete (no short-circuit)
  assert.equal(result.checks.length, 7);
});

// ── Probes (option-1 hardening): evidence beats claim ──────────────────────

/** A working Map-backed store probe. */
function workingStoreProbe() {
  const m = new Map<string, string>();
  return { write: (k: string, v: string) => void m.set(k, v), read: (k: string) => m.get(k) };
}

/** A working array-backed trace probe. */
function workingTraceProbe() {
  const lines: string[] = [];
  return { leave: (marker: string) => void lines.push(marker), read: () => lines };
}

test("without probe handles every condition is graded `declared`", () => {
  const result = checkPrecondition(validHost());
  assert.ok(result.checks.every((c) => c.basis === "declared"));
});

test("a working store probe grades E3 and P_b `probed` (round-trip held)", () => {
  const host: HostDeclaration = {
    ...validHost(),
    store: { persistsAcrossCycles: true, probe: workingStoreProbe() },
  };
  const result = checkPrecondition(host);
  assert.equal(result.outcome, "qualify");
  const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]));
  assert.equal(byId.E3!.basis, "probed");
  assert.equal(byId.P_b!.basis, "probed"); // P(b) inherits E3's evidence
});

test("evidence beats claim: a failing store probe fails E3 and P_b despite a true declaration", () => {
  const host: HostDeclaration = {
    ...validHost(),
    store: {
      persistsAcrossCycles: true, // the claim
      probe: { write: () => {}, read: () => undefined }, // the evidence: holds nothing
    },
  };
  const failed = expectNonStart(checkPrecondition(host));
  assert.ok(failed.includes("E3"));
  assert.ok(failed.includes("P_b"));
});

test("a throwing store probe refutes the declaration (E3 fails)", () => {
  const host: HostDeclaration = {
    ...validHost(),
    store: {
      persistsAcrossCycles: true,
      probe: { write: () => { throw new Error("disk gone"); }, read: () => undefined },
    },
  };
  const failed = expectNonStart(checkPrecondition(host));
  assert.ok(failed.includes("E3"));
});

test("a working trace probe grades E4 `probed`", () => {
  const host: HostDeclaration = {
    ...validHost(),
    trace: { externallyReadable: true, probe: workingTraceProbe() },
  };
  const result = checkPrecondition(host);
  assert.equal(result.outcome, "qualify");
  assert.equal(result.checks.find((c) => c.id === "E4")!.basis, "probed");
});

test("a trace probe whose marker cannot be read back fails E4", () => {
  const host: HostDeclaration = {
    ...validHost(),
    trace: {
      externallyReadable: true,
      probe: { leave: () => {}, read: () => [] }, // swallows the marker
    },
  };
  const failed = expectNonStart(checkPrecondition(host));
  assert.ok(failed.includes("E4"));
});

test("a negative declaration fails even when a working probe is attached", () => {
  const host: HostDeclaration = {
    ...validHost(),
    store: { persistsAcrossCycles: false, probe: workingStoreProbe() },
  };
  const failed = expectNonStart(checkPrecondition(host));
  // the host's own admission about across-cycle behaviour is not overruled
  assert.ok(failed.includes("E3"));
  assert.ok(failed.includes("P_b"));
});
