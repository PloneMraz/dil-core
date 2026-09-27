/**
 * T2 — Agency Differentiation (protocol §6.3, §7; stage 4d).
 *
 * Builds the self-written vs environment-pushed distinction by matching what the
 * agent just emitted against the observed change. This is where the self/
 * environment difference is FIRST drawn and the from-within standpoint begins —
 * the crystallization of §7. The self is the consequence of T2 running, not a
 * thing built here; this module makes no claim of self-continuity (forbidden).
 *
 * State accrues across cycles (INV-5): the matching window and the cycle counter
 * accumulate, they are never reloaded. Postcondition (INV-6): once sufficient
 * matching cycles have run (STABILITY_THRESHOLD), nothing leaves UNDECIDED —
 * enforced by assertAgencyClassified on the output.
 *
 * Thresholds MATCHING_WINDOW and STABILITY_THRESHOLD are DECIDE@IMPL tag B,
 * declared in decisions.ts.
 *
 * THE FIELD (INV-7). T2 reads `trust`: how far back an emission is still matched
 * as the cause of a change — the matching window, shifted by trust (the declared
 * window at NEUTRAL). It does not read the stability threshold: once T2 is
 * stable nothing may leave UNDECIDED again (INV-6), and a threshold the field
 * moved could put it back. It votes `alertness` from what only it sees: the share
 * of the changes it classified that the region pushed.
 */

import { assertAgencyClassified } from "../../invariants/guards.js";
import type { LayerSpec, Snapshottable } from "../layer.js";
import type { ActivityEnvironment, AgencyTag } from "../types.js";
import { MATCHING_WINDOW, STABILITY_THRESHOLD } from "../decisions.js";
import { ALERTNESS, TRUST, axis, castVotes, rising, share, shiftedCount } from "../field.js";

/** What the agent emitted this cycle. */
export interface Emission {
  readonly action: unknown;
}

/** A change observed in the region after the emission. */
export interface ObservedChange {
  readonly id: string;
  readonly value: unknown;
}

/** A change with its agency classification. */
export interface TaggedChange {
  readonly change: ObservedChange;
  readonly agency: AgencyTag;
}

export interface T2Input {
  readonly env: ActivityEnvironment;
  readonly emitted: Emission;
  readonly changes: readonly ObservedChange[];
  /**
   * The actions layers emitted laterally last cycle (§6.4) — a T3 query, a T5
   * test. The contract says every emission "MUST be readable by T2 at the next
   * cycle as 'the action just emitted'", not only the cycle's committed
   * response; without these, what a query brought back could never be matched
   * to the query, and the agency-gate could not classify it (INV-6).
   */
  readonly lateral?: readonly unknown[];
}

export interface T2Output {
  readonly tagged: readonly TaggedChange[];
  /**
   * True on the ONE run where T2 first draws the self/environment distinction —
   * the crystallization of §7 (the from-within standpoint begins). It marks the
   * *act* of distinguishing, not the self's persistence; a resumed T2 (restored
   * with an accrued cyclesRun) has already crystallized and never re-signals.
   */
  readonly crystallized: boolean;
}

export interface T2Options {
  readonly window?: number;
  readonly stabilityThreshold?: number;
  /** How an emitted action is judged to match an observed change's value. */
  readonly matches?: (action: unknown, value: unknown) => boolean;
}

/** Default match: structural equality (a chosen representation; overridable). */
function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createT2(opts: T2Options = {}): LayerSpec<T2Input, T2Output> & Snapshottable {
  const window = opts.window ?? MATCHING_WINDOW;
  const stability = opts.stabilityThreshold ?? STABILITY_THRESHOLD;
  const matches = opts.matches ?? jsonEqual;

  // Accruing state (INV-5): accumulated, never reloaded.
  const recentEmissions: unknown[] = [];
  let cyclesRun = 0;

  return {
    index: 2,
    consumes: [1],
    // §9 snapshot surface (recovery-only restore; see Snapshottable).
    snapshot: () => ({ recentEmissions: [...recentEmissions], cyclesRun }),
    restore(state: unknown): void {
      const s = state as { recentEmissions: unknown[]; cyclesRun: number };
      recentEmissions.length = 0;
      recentEmissions.push(...s.recentEmissions);
      cyclesRun = s.cyclesRun;
    },
    process(input, field, _emit, contribute): T2Output {
      // The crystallization of §7: T2 first drawing the self/environment
      // distinction. `cyclesRun === 0` is true only on the very first run (and,
      // after recovery, false — a restored cyclesRun means the self already
      // crystallized in the line being resumed).
      const crystallized = cyclesRun === 0;

      // Accrue this cycle's emission into the bounded matching window. What is
      // accrued is kept whole; the field only shifts how far back it is read.
      recentEmissions.push(input.emitted.action);
      for (const a of input.lateral ?? []) recentEmissions.push(a);
      while (recentEmissions.length > window * 2) recentEmissions.shift();
      const reach = shiftedCount(window, rising(axis(field, TRUST)));
      const matchable = recentEmissions.slice(-reach);
      cyclesRun += 1;

      const stable = cyclesRun >= stability;
      const tagged = input.changes.map((change): TaggedChange => {
        let agency: AgencyTag;
        if (!stable) {
          // The self/environment line is not yet trusted.
          agency = "UNDECIDED";
        } else {
          agency = matchable.some((a) => matches(a, change.value))
            ? "SELF_WRITTEN"
            : "ENV_PUSHED";
        }
        return { change, agency };
      });
      const classified = tagged.filter((t) => t.agency !== "UNDECIDED");
      const pushed = classified.filter((t) => t.agency === "ENV_PUSHED").length;
      castVotes(contribute, { [ALERTNESS]: share(pushed, classified.length) });
      return { tagged, crystallized };
    },
    post(output): void {
      // INV-6 postcondition: once stable, nothing leaves UNDECIDED.
      if (cyclesRun >= stability) {
        for (const t of output.tagged) {
          assertAgencyClassified({ agency: t.agency });
        }
      }
    },
  };
}
