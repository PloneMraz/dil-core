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
 *   - The floor-tag stamping every layer performs (protocol §9): `runLayer` calls
 *     `stampLayer` so the datum's floor-tag names the layer it just exited. The
 *     path itself is not kept on the datum — each exit is recorded as a lean line
 *     in the `[event]` log (v0.3.2 §6.1 dropped the running-type `layer_trace`).
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

/**
 * The lateral emission capability (§6.4) handed to a layer's `process`: pushing a
 * committed action out to the region. It is the structural MIRROR of the
 * modulatory field (INV-7): the field descends INTO `process` as read-only
 * background (the down-channel), `emit` projects OUT from it (the lateral
 * out-channel) — neither is a station on the meaning-channel (INV-3). A layer
 * calls it when its own work requires pushing to the region (a T2 probe, a T3
 * query, a T5 test, a T6 model-test — §6.4). The issuing layer is bound by
 * `runLayer` to the layer's own index; the layer never states it. Each declared
 * action is buffered and handed back to the driver, which records it as exactly
 * one activity record naming the issuing layer (§9); the layer itself never
 * writes to `[event]`. Register is always ↔ (INV-2) and correctness is judged
 * only by the next cycle's return, never by the emitting layer (§6.4).
 */
export type EmitFn = (action: unknown) => void;

/**
 * The UP-channel into the modulatory field (INV-7), handed to a layer's
 * `process` as the third of the three directions a layer can move in: `field`
 * descends into it as read-only background (down), `emit` projects out to the
 * region (lateral), `contribute` reaches up into the field.
 *
 * WHY IT HAD TO EXIST. INV-7 reads: "Every layer contributes to it as one
 * competing parameter; contributions blend, re-weighted each cycle, never
 * last-write-wins." Until now no layer could contribute at all — `process`
 * received `field` and `emit` and nothing else, and the sole caller of
 * `glob.contribute` in the whole implementation was the driver, once per cycle,
 * with one hard-coded key at a fixed weight. With a single contributor "every
 * layer contributes" was false, "one competing parameter" had nothing to
 * compete with, and "blend, never last-write-wins" was vacuous: one contribution
 * blended IS the last write. The blending machinery existed and was tested, and
 * nothing could reach it.
 *
 * This does NOT breach INV-3. The meaning-channel carries InfoUnits upward under
 * a strict ≤-index rule; the field is a separate channel that "acts downward
 * onto every layer", and §5 is explicit that "when an upper layer alters
 * GLOB-MOD it changes the field, which then conditions every layer from above;
 * no lower layer reaches up" — reaches up the MEANING-channel. Altering the
 * field is how a layer is supposed to influence the others, and the influence
 * still arrives only from above and only at N+1.
 *
 * The contributing layer is bound by `runLayer` to the layer's own index; a
 * layer never states it, exactly as with `emit`.
 */
export type ContributeFn = (params: Record<string, number>, weight?: number) => void;

/** One layer's contribution to the field this cycle, bound to its issuer. */
export interface LayerContribution {
  readonly layer: LayerIndex;
  readonly params: Record<string, number>;
  readonly weight: number;
}

/** The uniform layer contract. `In`/`Out` are the layer's meaning-channel types. */
export interface LayerSpec<In, Out> {
  readonly index: LayerIndex;
  /** Meaning-channel dependencies: layer indices this layer consumes (must be ≤ index). */
  readonly consumes: readonly LayerIndex[];
  /** Precondition — throws if the input does not satisfy the layer's contract. */
  pre?(input: In): void;
  /**
   * The layer's work. Reads the modulatory field as read-only background
   * (down-channel), MAY invoke `emit` to push a committed action to the region
   * (§6.4, lateral), and MAY invoke `contribute` to feed the field (INV-7, up).
   *
   * A layer that wants neither simply declares fewer parameters; most do.
   */
  process(input: In, field: ModField, emit: EmitFn, contribute: ContributeFn): Out;
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

/** One action a layer emitted during its run, tagged with the layer that raised it (§6.4). */
export interface LayerEmission {
  readonly issuingLayer: LayerIndex;
  readonly action: unknown;
}

export interface LayerRun<Out> {
  readonly output: Out;
  /** The datum after this layer stamped its floor-tag and appended to the trace. */
  readonly datum: TaggedDatum;
  /**
   * The actions this layer emitted during `process` (§6.4), each already bound to
   * this layer's index. The driver records one activity record per emission (§9);
   * the layer itself never touches `[event]`. Empty for the layers that do not emit.
   */
  readonly emissions: readonly LayerEmission[];
  /**
   * The contributions this layer made to the modulatory field during `process`
   * (INV-7), each already bound to this layer's index. The driver hands them to
   * GLOB-MOD, where they blend with every other layer's and take effect at N+1;
   * `runLayer` never touches the field itself. Empty for layers that do not
   * contribute.
   */
  readonly contributions: readonly LayerContribution[];
}

/**
 * Run one layer over its input under the modulatory field, against a datum.
 * Order: precondition → process (with the lateral emit capability) → INV-4 check
 * on emitted InfoUnits → postcondition → stamp the floor-tag.
 *
 * Emissions the layer declares through `emit`, and contributions it declares
 * through `contribute`, are buffered here (both bound to the layer's index — the
 * layer never states its own) and returned for the driver to act on; `runLayer`
 * itself never writes to `[event]` and never touches the field.
 */
export function runLayer<In, Out>(
  spec: LayerSpec<In, Out>,
  input: In,
  field: ModField,
  datum: TaggedDatum,
): LayerRun<Out> {
  spec.pre?.(input);
  const emissions: LayerEmission[] = [];
  const emit: EmitFn = (action) => {
    emissions.push({ issuingLayer: spec.index, action });
  };
  const contributions: LayerContribution[] = [];
  const contribute: ContributeFn = (params, weight = 1) => {
    contributions.push({ layer: spec.index, params, weight });
  };
  const output = spec.process(input, field, emit, contribute);
  for (const unit of spec.infoUnits?.(output) ?? []) {
    assertReferred(unit); // INV-4: ref_frame ≠ null
  }
  spec.post?.(output);
  const stamped = stampLayer(datum, spec.index);
  return { output, datum: stamped, emissions, contributions };
}
