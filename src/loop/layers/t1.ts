/**
 * T1 — Activity-Environment Confirmation (protocol §6.3; stage 4d).
 *
 * Confirms the presence of an activity-environment, the root reference frame.
 * It draws NO self/environment line — that is T2's work. In: the host's
 * `Signal[]` for the cycle. Out: an `ActivityEnvironment` (an InfoUnit whose
 * frame is the root). Precondition: none. Postcondition: presence confirmed for
 * T2.
 */

import type { LayerSpec } from "../layer.js";
import type { Signal, ActivityEnvironment } from "../types.js";

/** The root reference frame every higher layer ultimately refers to. */
const ROOT_FRAME = { boundLayer: 1, ref: "activity-environment" } as const;

function latestT(signals: readonly Signal[]): number {
  return signals.reduce((max, s) => (s.t > max ? s.t : max), 0);
}

export function createT1(): LayerSpec<readonly Signal[], ActivityEnvironment> {
  return {
    index: 1,
    consumes: [],
    process(signals): ActivityEnvironment {
      // Presence confirmed as the root reference frame. No self/environment line
      // is drawn here; the content only digests what is present this cycle.
      return {
        content: {
          present: signals.length > 0,
          count: signals.length,
          sources: signals.map((s) => s.source_id),
        },
        ref_frame: { ...ROOT_FRAME },
        t: latestT(signals),
        layer_trace: [1],
      };
    },
    // INV-4: the ActivityEnvironment is an InfoUnit leaving the layer.
    infoUnits: (out) => [out],
  };
}
