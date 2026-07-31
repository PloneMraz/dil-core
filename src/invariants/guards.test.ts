/**
 * Smoke test — Stage 2, the eight invariant guards (AGENTS.md "Build & Test").
 *
 * The fixed check this stage must satisfy: a step that violates any INV is
 * blocked — the guard halts (throws InvariantViolation), with no work-around.
 * For each invariant we assert both halves: a violating step halts with the
 * right INV id, and a conforming step passes.
 *
 * Uses node:test (built-in) on dummy data — no loop, no store yet.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { InvariantViolation, type InvariantId } from "./violation.js";
import {
  assertClosedLoop,
  assertCorrelational,
  assertMeaningChannelOrder,
  assertReferred,
  assertAccrual,
  assertAgencyClassified,
  assertGlobModUpdate,
  assertAppraisalIndependence,
} from "./guards.js";

/** Assert that `fn` halts with an InvariantViolation carrying `id`. */
function expectHalt(id: InvariantId, fn: () => void): void {
  assert.throws(
    fn,
    (err: unknown) =>
      err instanceof InvariantViolation && err.invariant === id,
    `expected ${id} halt`,
  );
}

// INV-1 — Closed loop.
test("INV-1 halts on a SINK (dead branch)", () => {
  expectHalt("INV-1", () =>
    assertClosedLoop([
      { from: 1, to: 2 },
      { from: 8, to: "SINK" },
    ]),
  );
});
test("INV-1 passes a closed topology (every target also produces onward)", () => {
  assert.doesNotThrow(() =>
    assertClosedLoop([
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 1 }, // closes the cycle — every node is both a source and a target
    ]),
  );
});
test("INV-1 halts on a dead-end layer: a target with no outgoing edge", () => {
  // node 3 receives output (2→3) but never produces onward — a dead branch with
  // no explicit SINK marker; the earlier check missed this.
  expectHalt("INV-1", () =>
    assertClosedLoop([
      { from: 1, to: 2 },
      { from: 2, to: 3 },
    ]),
  );
});

// INV-2 — ↔ not promoted to =.
test("INV-2 halts when a running output is =", () => {
  expectHalt("INV-2", () =>
    assertCorrelational({ tag: "INFO", register: "=" }),
  );
});
test("INV-2 passes a ↔ output (incl. action-commitment)", () => {
  assert.doesNotThrow(() =>
    assertCorrelational({ tag: "INFO", register: "↔", note: "action-commitment" }),
  );
});

// INV-3 — Meaning-channel order.
test("INV-3 halts when consuming from a higher layer", () => {
  expectHalt("INV-3", () => assertMeaningChannelOrder(3, 5));
});
test("INV-3 passes consuming from a lower or equal layer", () => {
  assert.doesNotThrow(() => assertMeaningChannelOrder(5, 3));
  assert.doesNotThrow(() => assertMeaningChannelOrder(4, 4));
});

// INV-4 — ref_frame ≠ null.
test("INV-4 halts on a null ref_frame", () => {
  expectHalt("INV-4", () =>
    assertReferred({ content: "x", ref_frame: null }),
  );
});
test("INV-4 passes a referred unit", () => {
  assert.doesNotThrow(() =>
    assertReferred({ content: "x", ref_frame: "frame-A" }),
  );
});

// INV-5 — accrue, not load.
test("INV-5 halts on a loaded temporal write", () => {
  expectHalt("INV-5", () => assertAccrual({ kind: "load" }));
});
test("INV-5 passes an accruing temporal write", () => {
  assert.doesNotThrow(() => assertAccrual({ kind: "accrue" }));
});

// INV-6 — agency-gate.
test("INV-6 halts interpreting an UNDECIDED change", () => {
  expectHalt("INV-6", () => assertAgencyClassified({ agency: "UNDECIDED" }));
});
test("INV-6 passes a classified change", () => {
  assert.doesNotThrow(() => assertAgencyClassified({ agency: "SELF_WRITTEN" }));
  assert.doesNotThrow(() => assertAgencyClassified({ agency: "ENV_PUSHED" }));
});

// INV-7 — GLOB-MOD blend + N+1 delay.
test("INV-7 halts on last-write-wins", () => {
  expectHalt("INV-7", () =>
    assertGlobModUpdate({ mode: "last-write", contribCycle: 1, effectCycle: 2 }),
  );
});
test("INV-7 halts when effect is within the contribution's own cycle", () => {
  expectHalt("INV-7", () =>
    assertGlobModUpdate({ mode: "blend", contribCycle: 3, effectCycle: 3 }),
  );
});
test("INV-7 passes a blended update taking effect at N+1", () => {
  assert.doesNotThrow(() =>
    assertGlobModUpdate({ mode: "blend", contribCycle: 3, effectCycle: 4 }),
  );
});

// INV-8 — appraisal independence.
test("INV-8 halts when criteria come from the edited state", () => {
  expectHalt("INV-8", () =>
    assertAppraisalIndependence({
      criteriaSource: "state-S",
      editedState: "state-S",
    }),
  );
});
test("INV-8 passes when criteria are external to the edited state", () => {
  assert.doesNotThrow(() =>
    assertAppraisalIndependence({
      criteriaSource: "mode-b-anchor",
      editedState: "state-S",
    }),
  );
});
