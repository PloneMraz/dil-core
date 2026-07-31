/**
 * The eight invariant guards (protocol §5).
 *
 * Each guard inspects one step and HALTS — throws InvariantViolation — when the
 * step would violate its invariant. A conforming step returns normally. There is
 * no "work around": the only responses are pass or halt (CONTEXT.md §3).
 *
 * These are structural laws, not tunable policy: no guard reads a threshold, and
 * none touches a DECIDE@IMPL constant.
 */

import { halt } from "./violation.js";
import type {
  AppraisalCriteria,
  Change,
  GlobModUpdate,
  LayerIndex,
  LoopEdge,
  ReferredUnit,
  RunningOutput,
  TemporalWrite,
} from "./types.js";

/**
 * INV-1 — Closed loop. Every layer output MUST have a path back to some layer's
 * input; no dead branches. Checked on topology, not per-packet timing (the
 * INV-1 note: a cycle-time constraint, not wall-clock). Halts if any edge
 * terminates in a SINK, or if any layer that RECEIVES output (a target) never
 * produces onward (is never a source) — its output dead-ends with no path back
 * into the loop.
 */
export function assertClosedLoop(edges: readonly LoopEdge[]): void {
  const sources = new Set<LayerIndex>();
  const targets = new Set<LayerIndex>();
  for (const edge of edges) {
    if (edge.to === "SINK") {
      halt("INV-1", `layer T${edge.from} output terminates in a SINK (dead branch)`);
    }
    sources.add(edge.from);
    targets.add(edge.to); // `to` narrowed to LayerIndex — SINK already halted
  }
  // A layer that receives output but has no outgoing edge is a dead branch: the
  // output that reached it has no path back into the loop. (A source always has
  // an outgoing edge by construction, so the meaningful check is over targets.)
  for (const layer of targets) {
    if (!sources.has(layer)) {
      halt("INV-1", `layer T${layer} receives output but has no outgoing edge (dead branch)`);
    }
  }
}

/**
 * INV-2 — Output-register identity. Every running output is tagged INFO and is a
 * correlation (↔), never a frozen identity (=). Committing to an action is still
 * a ↔, so it passes; demanding/asserting = before the loop has stopped halts.
 */
export function assertCorrelational(output: RunningOutput): void {
  if (output.register === "=") {
    halt(
      "INV-2",
      `running output promoted ↔ to = (identity)${output.note ? `: ${output.note}` : ""}`,
    );
  }
}

/**
 * INV-3 — One-directional dependency on the meaning-channel. Layer N consumes
 * only outputs of layers ≤ N. Halts if a consumer reads from a higher source.
 * (The modulatory field acts downward and is governed by INV-7, not here.)
 */
export function assertMeaningChannelOrder(
  consumer: LayerIndex,
  source: LayerIndex,
): void {
  if (source > consumer) {
    halt(
      "INV-3",
      `layer T${consumer} consumes from higher layer T${source} on the meaning-channel`,
    );
  }
}

/**
 * INV-4 — Meaning as relation. No layer assigns meaning to a signal in
 * isolation; meaning is a function of (signal, lower-layer context). Halts if a
 * unit leaves a layer without a reference frame.
 */
export function assertReferred(unit: ReferredUnit): void {
  if (unit.ref_frame === null) {
    halt("INV-4", "unit has null ref_frame (a signal, not yet information)");
  }
}

/**
 * INV-5 — History accrues, is not loaded. Temporal state forms only through
 * sequential accumulation. Halts if a temporal-state write loads prior state
 * pre-formed rather than accruing it (a reloaded context masquerading as a self).
 */
export function assertAccrual(write: TemporalWrite): void {
  if (write.kind === "load") {
    halt(
      "INV-5",
      `temporal state loaded instead of accrued${write.note ? `: ${write.note}` : ""}`,
    );
  }
}

/**
 * INV-6 — Agency-gate. Every change MUST be classified self-written or
 * environment-pushed before interpretation. Halts if a change reaches
 * interpretation still UNDECIDED.
 */
export function assertAgencyClassified(change: Change): void {
  if (change.agency === "UNDECIDED") {
    halt("INV-6", "change interpreted while still UNDECIDED (agency-gate bypassed)");
  }
}

/**
 * INV-7 — GLOB-MOD. Contributions blend, re-weighted each cycle, never
 * last-write-wins; a layer's cycle-N contribution conditions the field only from
 * N+1. Halts on last-write-wins, or on a contribution taking effect within its
 * own cycle (effect must be strictly later than the contribution).
 */
export function assertGlobModUpdate(update: GlobModUpdate): void {
  if (update.mode === "last-write") {
    halt("INV-7", "GLOB-MOD updated last-write-wins instead of blended");
  }
  if (update.effectCycle <= update.contribCycle) {
    halt(
      "INV-7",
      `GLOB-MOD contribution at cycle ${update.contribCycle} conditions the field at cycle ${update.effectCycle} (must be ≥ N+1)`,
    );
  }
}

/**
 * INV-8 — Appraisal step. The appraisal MUST NOT draw its criteria from the
 * state the agent is editing, otherwise it is self-scoring and hackable. Halts
 * if the criteria source is the edited state.
 */
export function assertAppraisalIndependence(criteria: AppraisalCriteria): void {
  if (criteria.criteriaSource === criteria.editedState) {
    halt(
      "INV-8",
      `appraisal draws criteria from the edited state "${criteria.editedState}" (self-scoring)`,
    );
  }
}
