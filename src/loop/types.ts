/**
 * Shared types of the loop (protocol §6.1).
 *
 * The notation in §6.1 is abstract; concrete representation is DECIDE@IMPL tag A
 * (declared in decisions.ts). This module fixes the TypeScript shapes the eight
 * layers consume and produce.
 *
 * Reconciliation with the inner rings (build-order ring order: invariants are
 * innermost, the loop is outer, so the loop depends on them, never the reverse):
 *   - `LayerIndex`, `AgencyTag` are owned by the invariants ring (../invariants)
 *     and imported here — not redefined.
 *   - `LayerTrace`, `ResistEvent`, `MismatchKind` are owned by the store
 *     (../store) and re-used here — the loop writes into the store, so it shares
 *     the store's shapes rather than duplicating them.
 *
 * INV-4 at the type level: an `InfoUnit` has a NON-NULL `ref_frame`. A `Signal`
 * has none. That difference is the type-level enforcement of "meaning is a
 * function of (signal, lower-layer context)": a signal without a frame is simply
 * not yet an InfoUnit.
 */

import type { LayerIndex } from "../invariants/types.js";

// Re-export the borrowed shapes so the loop has one import surface.
export type { LayerIndex, AgencyTag } from "../invariants/types.js";
export type { ResistEvent, MismatchKind } from "../store/resist-event.js";

/**
 * The reference frame an InfoUnit is referred to (DECIDE@IMPL tag A). A non-null
 * structured handle: the lower layer that supplies the context, plus an
 * identifier of that context. Its non-nullability is INV-4 at the type level.
 */
export interface RefFrame {
  /** The lower layer whose output supplies the context (INV-3: ≤ consumer). */
  readonly boundLayer: LayerIndex;
  /** Identifier of the context frame within that layer. */
  readonly ref: string;
}

/** Raw data, not yet meaning (no ref_frame). */
export interface Signal {
  readonly source_id: string;
  readonly raw_payload: unknown;
  readonly t: number;
}

/**
 * Information = content referred to a frame. `ref_frame` is non-null by type
 * (INV-4). The path a datum has travelled is NOT carried here: v0.3.2 §6.1 drops
 * `layer_trace` from `InfoUnit` — it duplicated, in a mutable running type, the
 * same path the append-only `[event]` log already records, and no layer read it.
 * The path is read from `[event]`, never from a running-type field.
 */
export interface InfoUnit {
  readonly content: unknown;
  readonly ref_frame: RefFrame;
  readonly t: number;
}

/**
 * Presence confirmed, not yet a self/environment line (T1 output). It is an
 * InfoUnit: the root reference frame.
 */
export type ActivityEnvironment = InfoUnit;

/** The window of prior information an Expectation was built from. */
export type HistoryWindow = readonly InfoUnit[];

/** A prediction about what a stable entity will return (T5). */
export interface Expectation {
  readonly predicted: InfoUnit;
  /** Strength of the prediction (a value, not a threshold). */
  readonly confidence: number;
  readonly built_from: HistoryWindow;
}

/** The sign a PredErr carries; absence registers as negative (T7). */
export type Sign = "+" | "-";

/**
 * Prediction error — where resistance (E2) becomes information (T5/T7).
 * `observed` is null when the expected event failed to occur (absence, T7);
 * `signed` records direction, `delta` the magnitude.
 */
export interface PredErr {
  readonly observed: InfoUnit | null;
  readonly predicted: InfoUnit;
  readonly delta: number;
  readonly signed: Sign;
}

/** A model of an Other; lives fully under Mode-B (T6). */
export interface OtherModel {
  readonly entity_id: string;
  readonly context_map: Readonly<Record<string, unknown>>;
  readonly independence_evidence: unknown;
}

/** Relative value of an entity; exists only when N ≥ 2 (T8). */
export interface RelValue {
  readonly entity_id: string;
  readonly relative_rank: number;
  readonly comparison_basis: string;
}

/** An Other↔Other interaction observed with no self present (T8). */
export interface SocialEdge {
  readonly a_id: string;
  readonly b_id: string;
  readonly observed_interaction: unknown;
}

/**
 * GLOB-MOD, the modulatory field, reaching every layer field-to-layer (INV-7).
 * `params` carries how to read (gains/biases), never what is read. The update
 * law (blend, never last-write; effect at N+1) is implemented in glob-mod.ts.
 */
export interface ModField {
  readonly params: Readonly<Record<string, number>>;
  readonly t: number;
}

/** Output of the appraisal step (link 4, INV-8). */
export interface Appraisal {
  /** Reference to the appraised information. */
  readonly info_ref: string;
  /** Direction/value assigned, relative to the cycle's context (not a fixed scale). */
  readonly valence: number;
  readonly goal_relevance: number;
}

/**
 * An emitted action — link 5 as a lateral capability (§6.4). Emission belongs to
 * no single layer; any layer MAY invoke it when its work requires pushing to the
 * region. Whatever layer issues it, an emission carries register `↔` (a revisable
 * best-current-guess read against the next cycle's consequence), NEVER `=`
 * (INV-2): committing to an action is not promoting a correlation to an identity.
 * Its correctness is never scored by the emitting layer — only the next cycle's
 * return judges it (no internal action-arbiter, §6.4).
 *
 * The capability is genuinely afforded, not merely typed: `process` receives a
 * layer-bound `emit` (layer.ts, the structural mirror of the modulatory field),
 * so any layer CAN raise an emission and the driver records it against that
 * layer. What the minimal scripted host does NOT do is drive per-layer
 * probes/queries/tests — a *real* emission (a layer pushing to a live region and
 * reading its return) only occurs with a real host, so under the scripted host
 * the only action issued is the appraisal-driven terminal response (issuing layer
 * T8). Affording the capability is not fabricating behaviour for it.
 */
export interface Directive {
  /** The committed action pushed to the region. */
  readonly committed_action: unknown;
  /** Always `↔` — a live, revisable correlation; never `=` (INV-2). */
  readonly register: "↔";
  /** The layer that issued this emission. */
  readonly issuing_layer: LayerIndex;
  /** The appraisal(s) this action was built from. */
  readonly built_from: readonly Appraisal[];
  readonly t: number;
}
