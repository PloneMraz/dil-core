/**
 * The layer scaffold (protocol §6.3; stage 4c).
 *
 * A uniform contract every layer T1–T8 plugs into, with no layer logic yet
 * (that is 4d). Each layer maps to one link and satisfies an Input/Output/
 * Precondition/Postcondition contract. The scaffold wires three invariants at
 * the points the loop touches them:
 *   - INV-3 (meaning-channel): a layer may declare it consumes only layers ≤ its
 *     own index — `validateLayerSpec` halts otherwise.
 *   - INV-4 (meaning as relation): every InfoUnit a layer emits MUST carry a
 *     non-null ref_frame — `runLayer` asserts it (defense in depth atop the
 *     type-level guarantee).
 *   - The floor-tag/layer_trace stamping every layer performs (protocol §9):
 *     `runLayer` calls `stampLayer` so the datum records the layer it just
 *     exited and appends to its audit path.
 *
 * The modulatory field is passed to `process` as read-only background (the
 * down-channel, INV-7); it is a separate argument from the meaning-channel
 * inputs (the up-channel, INV-3) — the two channels are never collapsed.
 */

import { assertMeaningChannelOrder, assertReferred } from "../invariants/guards.js";
import { stampLayer } from "../store/data-store.js";
import type { LayerIndex } from "../invariants/types.js";
import type { TaggedDatum } from "../store/tags.js";
import type { InfoUnit, ModField } from "./types.js";

/** The uniform layer contract. `In`/`Out` are the layer's meaning-channel types. */
export interface LayerSpec<In, Out> {
  readonly index: LayerIndex;
  /** Meaning-channel dependencies: layer indices this layer consumes (must be ≤ index). */
  readonly consumes: readonly LayerIndex[];
  /** Precondition — throws if the input does not satisfy the layer's contract. */
  pre?(input: In): void;
  /** The layer's work. Reads the modulatory field as read-only background. */
  process(input: In, field: ModField): Out;
  /** Postcondition — throws if the output does not satisfy the layer's contract. */
  post?(output: Out): void;
  /** The InfoUnits this output carries, for INV-4 enforcement (none by default). */
  infoUnits?(output: Out): readonly InfoUnit[];
}

/**
 * INV-3 at registration: a layer may consume only layers ≤ its own index on the
 * meaning-channel. Halts (assertMeaningChannelOrder) if it declares otherwise.
 */
export function validateLayerSpec(spec: {
  readonly index: LayerIndex;
  readonly consumes: readonly LayerIndex[];
}): void {
  for (const from of spec.consumes) {
    assertMeaningChannelOrder(spec.index, from);
  }
}

/**
 * A stateful layer exposes its accrued state for the §9 commit snapshot, and a
 * RECOVERY-ONLY restore. Restoring re-instates state this very loop accrued
 * (resuming the causal line) — it is not a within-cycle operation and never a
 * pre-load of fabricated history, so INV-5 is untouched.
 */
export interface Snapshottable {
  snapshot(): unknown;
  restore(state: unknown): void;
}

/** Whether a layer spec exposes snapshot surfaces. */
export function isSnapshottable(spec: object): spec is Snapshottable {
  return (
    typeof (spec as Snapshottable).snapshot === "function" &&
    typeof (spec as Snapshottable).restore === "function"
  );
}

export interface LayerRun<Out> {
  readonly output: Out;
  /** The datum after this layer stamped its floor-tag and appended to the trace. */
  readonly datum: TaggedDatum;
}

/**
 * Run one layer over its input under the modulatory field, against a datum.
 * Order: precondition → process → INV-4 check on emitted InfoUnits →
 * postcondition → stamp the floor-tag/layer_trace.
 */
export function runLayer<In, Out>(
  spec: LayerSpec<In, Out>,
  input: In,
  field: ModField,
  datum: TaggedDatum,
): LayerRun<Out> {
  spec.pre?.(input);
  const output = spec.process(input, field);
  for (const unit of spec.infoUnits?.(output) ?? []) {
    assertReferred(unit); // INV-4: ref_frame ≠ null
  }
  spec.post?.(output);
  const stamped = stampLayer(datum, spec.index);
  return { output, datum: stamped };
}
