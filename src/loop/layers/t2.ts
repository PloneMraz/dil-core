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
 */

import { assertAgencyClassified } from "../../invariants/guards.js";
import type { LayerSpec } from "../layer.js";
import type { ActivityEnvironment, AgencyTag } from "../types.js";
import { MATCHING_WINDOW, STABILITY_THRESHOLD } from "../decisions.js";

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
}

export interface T2Output {
  readonly tagged: readonly TaggedChange[];
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

export function createT2(opts: T2Options = {}): LayerSpec<T2Input, T2Output> {
  const window = opts.window ?? MATCHING_WINDOW;
  const stability = opts.stabilityThreshold ?? STABILITY_THRESHOLD;
  const matches = opts.matches ?? jsonEqual;

  // Accruing state (INV-5): accumulated, never reloaded.
  const recentEmissions: unknown[] = [];
  let cyclesRun = 0;

  return {
    index: 2,
    consumes: [1],
    process(input): T2Output {
      // Accrue this cycle's emission into the bounded matching window.
      recentEmissions.push(input.emitted.action);
      while (recentEmissions.length > window) recentEmissions.shift();
      cyclesRun += 1;

      const stable = cyclesRun >= stability;
      const tagged = input.changes.map((change): TaggedChange => {
        let agency: AgencyTag;
        if (!stable) {
          // The self/environment line is not yet trusted.
          agency = "UNDECIDED";
        } else {
          agency = recentEmissions.some((a) => matches(a, change.value))
            ? "SELF_WRITTEN"
            : "ENV_PUSHED";
        }
        return { change, agency };
      });
      return { tagged };
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
