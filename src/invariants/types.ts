/**
 * Minimal, provisional types the invariant guards operate on.
 *
 * PROVISIONAL: stage 2 of the build order needs only enough structure to state
 * what each guard checks on dummy data. The full shared types (protocol §6.1 —
 * Signal, InfoUnit, AgencyTag, ModField, …) are built with the loop in stage 4;
 * these definitions are deliberately narrow and will be reconciled with — or
 * re-exported from — those when the loop lands. They introduce no thresholds and
 * no DECIDE@IMPL constants; the invariants are structural laws (protocol §5).
 */

/** Layer index on the meaning-channel, T1..T8 (protocol §6.3). */
export type LayerIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Output register (protocol §3, INV-2). `↔` is a live, revisable correlation —
 * the register of every running output, including action-commitments. `=` is a
 * frozen identity claim, which appears only when the loop has stopped.
 */
export type Register = "↔" | "=";

/** A running output carries an INFO tag and a register (INV-2). */
export interface RunningOutput {
  readonly tag: "INFO";
  readonly register: Register;
  readonly note?: string;
}

/** Agency classification (protocol §6.1; INV-6). */
export type AgencyTag = "SELF_WRITTEN" | "ENV_PUSHED" | "UNDECIDED";

/** A change presented for interpretation must already carry an AgencyTag. */
export interface Change {
  readonly agency: AgencyTag;
  readonly note?: string;
}

/** A unit of information; meaning is relational, so ref_frame must be set (INV-4). */
export interface ReferredUnit {
  readonly content: unknown;
  /** The frame the content is referred to. `null` ⇒ not yet information. */
  readonly ref_frame: unknown | null;
}

/** A temporal-state write: it either accrues onto prior state or loads it (INV-5). */
export interface TemporalWrite {
  readonly kind: "accrue" | "load";
  readonly note?: string;
}

/** A directed edge in the loop topology (INV-1). `"SINK"` is a terminal dead end. */
export interface LoopEdge {
  readonly from: LayerIndex;
  readonly to: LayerIndex | "SINK";
}

/** A GLOB-MOD field update (INV-7). */
export interface GlobModUpdate {
  /** How contributions combine. `last-write` overwrites and is forbidden. */
  readonly mode: "blend" | "last-write";
  /** Cycle in which a layer's contribution was made. */
  readonly contribCycle: number;
  /** Cycle in which that contribution is allowed to condition the field. */
  readonly effectCycle: number;
}

/**
 * The provenance of an appraisal's criteria (INV-8). The appraisal step MUST NOT
 * draw criteria from the state the agent is editing (self-scoring is hackable).
 */
export interface AppraisalCriteria {
  /** Identifier of where the criteria come from. */
  readonly criteriaSource: string;
  /** Identifier of the state the agent is currently editing. */
  readonly editedState: string;
}
