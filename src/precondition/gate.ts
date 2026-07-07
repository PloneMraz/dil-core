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
import { PROBE_NONCE_PREFIX } from "./decisions.js";

/** The seven structural conditions of protocol §4. */
export type ConditionId = "E1" | "E2" | "E3" | "E4" | "P_a" | "P_b" | "P_c";

/**
 * How a condition's verdict was reached (precondition/decisions.ts):
 * `probed` — the gate exercised a host-declared handle and observed the result;
 * `declared` — the gate read the host's declaration (the designed mechanism of
 * requisition; graded honestly rather than dressed up as a measurement).
 */
export type ConditionBasis = "declared" | "probed";

export interface ConditionResult {
  readonly id: ConditionId;
  readonly passed: boolean;
  /** How this verdict was reached. */
  readonly basis: ConditionBasis;
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

/** A per-run nonce so a stale value or an echoing handle cannot fake a pass. */
function probeNonce(): string {
  return `${PROBE_NONCE_PREFIX}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

/** E1 — Differentiability. */
function checkE1(host: HostDeclaration): ConditionResult {
  const passed = host.boundary.present;
  return {
    id: "E1",
    passed,
    basis: "declared",
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
    basis: "declared",
    detail: passed
      ? `${returning.length} of ${host.channels.length} channel(s) can return a non-silent response`
      : host.channels.length === 0
        ? "void field: no channels declared"
        : "void field: no declared channel can return anything other than silence",
  };
}

/**
 * E3 — Temporal accumulation. When the host declares a store probe handle, the
 * gate performs a marker round-trip (E3_PROBE_DESIGN): evidence beats claim —
 * a failed or throwing probe fails the condition even if declared true. A
 * negative declaration fails regardless: a momentary round-trip cannot overrule
 * the host's own admission about its across-cycle behaviour.
 */
function checkE3(host: HostDeclaration): Omit<ConditionResult, "id"> {
  if (!host.store.persistsAcrossCycles) {
    return {
      passed: false,
      basis: "declared",
      detail: "no cross-cycle persistence: history cannot accrue",
    };
  }
  const probe = host.store.probe;
  if (!probe) {
    return {
      passed: true,
      basis: "declared",
      detail: "state persists across cycles: history can accrue (declared; no probe handle)",
    };
  }
  try {
    const nonce = probeNonce();
    probe.write("__dil_probe_e3__", nonce);
    const back = probe.read("__dil_probe_e3__");
    if (back === nonce) {
      return {
        passed: true,
        basis: "probed",
        detail: "marker round-trip held through the declared store handle",
      };
    }
    return {
      passed: false,
      basis: "probed",
      detail: `probe refuted the declaration: wrote a nonce, read back ${back === undefined ? "nothing" : "a different value"}`,
    };
  } catch (err) {
    return {
      passed: false,
      basis: "probed",
      detail: `probe refuted the declaration: store handle threw (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

/**
 * E4 — Observable projection. When the host declares a trace probe handle, the
 * gate leaves a marker and reads the trace back for it (E4_PROBE_DESIGN); same
 * evidence-beats-claim rules as E3.
 */
function checkE4(host: HostDeclaration): ConditionResult {
  if (!host.trace.externallyReadable) {
    return {
      id: "E4",
      passed: false,
      basis: "declared",
      detail: "actions leave no externally readable trace",
    };
  }
  const probe = host.trace.probe;
  if (!probe) {
    return {
      id: "E4",
      passed: true,
      basis: "declared",
      detail: "actions leave an externally readable trace (declared; no probe handle)",
    };
  }
  try {
    const nonce = probeNonce();
    probe.leave(nonce);
    const found = probe.read().includes(nonce);
    return {
      id: "E4",
      passed: found,
      basis: "probed",
      detail: found
        ? "marker left through the declared trace handle and read back externally"
        : "probe refuted the declaration: the left marker was not readable back",
    };
  } catch (err) {
    return {
      id: "E4",
      passed: false,
      basis: "probed",
      detail: `probe refuted the declaration: trace handle threw (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

/** P(a) — emission: capacity to emit a first action. */
function checkPa(host: HostDeclaration): ConditionResult {
  const passed = host.emitter.canEmitFirstAction;
  return {
    id: "P_a",
    passed,
    basis: "declared",
    detail: passed
      ? "host can emit a first action at cycle-0"
      : "host cannot emit a first action: T2 never rises to FIRST",
  };
}

/** P(c) — no self-wipe on mismatch, else no scar survives. */
function checkPc(host: HostDeclaration): ConditionResult {
  const passed = !host.resilience.wipesStateOnMismatch;
  return {
    id: "P_c",
    passed,
    basis: "declared",
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
  // P(b) is E3 restated for bootstrap: it inherits the same outcome (and the
  // same probe evidence) rather than re-deriving it.
  const e3 = checkE3(host);
  const checks: readonly ConditionResult[] = [
    checkE1(host),
    checkE2(host),
    { id: "E3", ...e3 },
    checkE4(host),
    checkPa(host),
    {
      id: "P_b",
      passed: e3.passed,
      basis: e3.basis,
      detail: e3.passed
        ? `host holds state across cycles for bootstrap accrual (INV-5) — ${e3.basis}`
        : `bootstrap accrual impossible: ${e3.detail}`,
    },
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
