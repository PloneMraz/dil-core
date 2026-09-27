/**
 * T1 — Activity-Environment Confirmation (protocol §6.3; stage 4d).
 *
 * Confirms the presence of an activity-environment, the root reference frame.
 * It draws NO self/environment line — that is T2's work. In: the host's
 * `Signal[]` for the cycle. Out: an `ActivityEnvironment` (an InfoUnit whose
 * frame is the root). Precondition: none. Postcondition: presence confirmed for
 * T2.
 *
 * THE FIELD (INV-7). T1 reads `trust`: how many silent cycles it holds the
 * environment confirmed through (T1_GRACE_MAX) — none at NEUTRAL, which is the
 * reference behaviour. A silence against a background of returns is a mismatch
 * (§4), not the environment gone. It votes `trust` from what only it sees:
 * whether the region said anything at all this cycle.
 */

import type { LayerSpec, Snapshottable } from "../layer.js";
import type { Signal, ActivityEnvironment } from "../types.js";
import { T1_GRACE_MAX } from "../decisions.js";
import { TRUST, axis, castVotes } from "../field.js";

/** The root reference frame every higher layer ultimately refers to. */
const ROOT_FRAME = { boundLayer: 1, ref: "activity-environment" } as const;

function latestT(signals: readonly Signal[]): number {
  return signals.reduce((max, s) => (s.t > max ? s.t : max), 0);
}

/** How many silent cycles trust holds the environment through: 0 at NEUTRAL or below. */
export function graceOf(trust: number): number {
  return Math.round(T1_GRACE_MAX * Math.max(0, 2 * trust - 1));
}

export function createT1(): LayerSpec<readonly Signal[], ActivityEnvironment> & Snapshottable {
  // Silent cycles in a row, accrued (INV-5).
  let silentFor = 0;

  return {
    index: 1,
    consumes: [],
    snapshot: () => ({ silentFor }),
    restore(state: unknown): void {
      silentFor = (state as { silentFor?: number }).silentFor ?? 0;
    },
    process(signals, field, _emit, contribute): ActivityEnvironment {
      // Presence confirmed as the root reference frame. No self/environment line
      // is drawn here; the content only digests what is present this cycle.
      const said = signals.length > 0;
      silentFor = said ? 0 : silentFor + 1;
      const held = !said && silentFor <= graceOf(axis(field, TRUST));
      castVotes(contribute, { [TRUST]: said ? 1 : 0 });
      return {
        content: {
          present: said || held,
          count: signals.length,
          sources: signals.map((s) => s.source_id),
          ...(held ? { heldThroughSilence: silentFor } : {}),
        },
        ref_frame: { ...ROOT_FRAME },
        t: latestT(signals),
      };
    },
    // INV-4: the ActivityEnvironment is an InfoUnit leaving the layer.
    infoUnits: (out) => [out],
  };
}
