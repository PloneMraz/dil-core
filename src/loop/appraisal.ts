/**
 * The appraisal step (protocol §6 link 4, §8.5, INV-8; stage 4e).
 *
 * Between integration and response, the loop assigns direction and value. Two
 * rules bind it:
 *   - INV-8: it MUST NOT draw its criteria from the state the agent is editing
 *     (self-scoring is hackable). Here the criteria come from the declared
 *     out-of-loop anchor (decisions.ts, tag C) — external to the edited state.
 *   - §8.5: the standard is context, not a fixed scale. The appraisal reads the
 *     current ModField (GLOB-MOD) as the conditioning context, so the same info
 *     under a different field receives a different valence. The verdict is a ↔
 *     (revisable), not a `=`.
 */

import { assertAppraisalIndependence } from "../invariants/guards.js";
import { APPRAISAL_ANCHOR_ID } from "./decisions.js";
import type { Appraisal, ModField, PredErr } from "./types.js";

export interface AppraisalInput {
  /** Reference to the information being appraised (e.g. a cycle id). */
  readonly infoRef: string;
  /** The cycle's prediction errors (resistance registered this cycle). */
  readonly predErrs: readonly PredErr[];
  /** The cycle's modulatory field — the conditioning context (§8.5). */
  readonly field: ModField;
  /** Identifier of the state the agent is editing (for the INV-8 check). */
  readonly editedState: string;
}

/**
 * Appraise the cycle's integrated information. The valence reflects the
 * resistance met, scaled by the field's appraisal gain (context-dependent);
 * goal-relevance reflects how much of the cycle was resistance. Both are a ↔.
 */
export function appraise(input: AppraisalInput): Appraisal {
  // INV-8: criteria come from the external anchor, never the edited state.
  assertAppraisalIndependence({
    criteriaSource: APPRAISAL_ANCHOR_ID,
    editedState: input.editedState,
  });

  // §8.5: read the current field as the conditioning context.
  const gain = input.field.params.appraisalGain ?? 1;
  const resistance = input.predErrs.reduce((sum, e) => sum + e.delta, 0);

  return {
    info_ref: input.infoRef,
    // meeting resistance is informative but counts against the current goal-fit;
    // scaled by the context's gain (same info, different field → different valence)
    valence: -resistance * gain,
    goal_relevance:
      input.predErrs.length > 0
        ? Math.min(1, resistance / input.predErrs.length)
        : 0,
  };
}
