/**
 * The precondition gate — "check before the king sits down" (CONTEXT.md §6).
 *
 * Before DIL starts, it checks whether the host can be reigned over at all.
 * If the host does not qualify → a *clean non-start* (protocol §4): report the
 * reason, do nothing further. Not a half-running degraded DIL. Presiding over a
 * room of the unresponsive is no reign.
 *
 * Every check here is static — answerable purely by reading the host
 * declaration, before the loop runs. The gate evaluates all conditions (so the
 * report is complete) and then decides: pass all → qualify; fail any →
 * non-start.
 *
 * This module is intentionally independent of the loop, the store, and the
 * invariants (build order, AGENTS.md §"Build order" step 1).
 */

import type { HostDeclaration } from "../host/declaration.js";

/** The seven structural conditions of protocol §4. */
export type ConditionId = "E1" | "E2" | "E3" | "E4" | "P_a" | "P_b" | "P_c";

export interface ConditionResult {
  readonly id: ConditionId;
  readonly passed: boolean;
  /** Human-readable account of why this condition passed or failed. */
  readonly detail: string;
}

export type GateResult =
  | {
      readonly outcome: "qualify";
      readonly checks: readonly ConditionResult[];
    }
  | {
      readonly outcome: "non-start";
      readonly checks: readonly ConditionResult[];
      readonly failed: readonly ConditionId[];
      readonly reason: string;
    };

/** E1 — Differentiability. */
function checkE1(host: HostDeclaration): ConditionResult {
  const passed = host.boundary.present;
  return {
    id: "E1",
    passed,
    detail: passed
      ? "boundary present: an internal/external distinction can be drawn"
      : "no boundary: nothing affords an internal/external distinction",
  };
}

/**
 * E2 — Interaction. At least one channel can return something other than
 * silence. Zero channels, or all channels silent, is a void field.
 */
function checkE2(host: HostDeclaration): ConditionResult {
  const returning = host.channels.filter((c) => c.canReturn);
  const passed = returning.length >= 1;
  return {
    id: "E2",
    passed,
    detail: passed
      ? `${returning.length} of ${host.channels.length} channel(s) can return a non-silent response`
      : host.channels.length === 0
        ? "void field: no channels declared"
        : "void field: no declared channel can return anything other than silence",
  };
}

/** E3 — Temporal accumulation. */
function checkE3(host: HostDeclaration): ConditionResult {
  const passed = host.store.persistsAcrossCycles;
  return {
    id: "E3",
    passed,
    detail: passed
      ? "state persists across cycles: history can accrue"
      : "no cross-cycle persistence: history cannot accrue",
  };
}

/** E4 — Observable projection. */
function checkE4(host: HostDeclaration): ConditionResult {
  const passed = host.trace.externallyReadable;
  return {
    id: "E4",
    passed,
    detail: passed
      ? "actions leave an externally readable trace"
      : "actions leave no externally readable trace",
  };
}

/** P(a) — emission: capacity to emit a first action. */
function checkPa(host: HostDeclaration): ConditionResult {
  const passed = host.emitter.canEmitFirstAction;
  return {
    id: "P_a",
    passed,
    detail: passed
      ? "host can emit a first action at cycle-0"
      : "host cannot emit a first action: T2 never rises to FIRST",
  };
}

/** P(b) — E3 restated for bootstrap: accrual, not loading (INV-5). */
function checkPb(host: HostDeclaration): ConditionResult {
  const passed = host.store.persistsAcrossCycles;
  return {
    id: "P_b",
    passed,
    detail: passed
      ? "host holds state across cycles for bootstrap accrual (INV-5)"
      : "host cannot hold state across cycles: bootstrap accrual impossible",
  };
}

/** P(c) — no self-wipe on mismatch, else no scar survives. */
function checkPc(host: HostDeclaration): ConditionResult {
  const passed = !host.resilience.wipesStateOnMismatch;
  return {
    id: "P_c",
    passed,
    detail: passed
      ? "host does not wipe its state on mismatch: scars can survive"
      : "self-wipe defect: host resets on every mismatch, no scar survives",
  };
}

/**
 * Run the precondition gate over a host declaration.
 *
 * Evaluates all seven conditions, then decides. Pass all → qualify (the king
 * sits, the loop may start). Fail any → non-start, with the failing condition
 * ids and a reason assembled from their details.
 */
export function checkPrecondition(host: HostDeclaration): GateResult {
  const checks: readonly ConditionResult[] = [
    checkE1(host),
    checkE2(host),
    checkE3(host),
    checkE4(host),
    checkPa(host),
    checkPb(host),
    checkPc(host),
  ];

  const failedChecks = checks.filter((c) => !c.passed);

  if (failedChecks.length === 0) {
    return { outcome: "qualify", checks };
  }

  const failed = failedChecks.map((c) => c.id);
  const reason =
    "host does not qualify; clean non-start. Failed: " +
    failedChecks.map((c) => `${c.id} (${c.detail})`).join("; ");

  return { outcome: "non-start", checks, failed, reason };
}
