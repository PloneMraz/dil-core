/**
 * Declared DECIDE@IMPL choices for the loop's shared types (protocol §12 tag A).
 *
 * Tag A — "Concrete representation of Signal, InfoUnit, and ActivityEnvironment"
 * — is left open by the protocol because it depends on the environment. This
 * file declares the representations chosen for the minimal host, so nothing in
 * types.ts is a silently-invented shape (AGENTS.md "Do NOT invent the deferred
 * constants"). These are environment decisions, not protocol law.
 *
 * Numeric thresholds (tag B: matching window, stability, baseline, recurrence,
 * history window) belong to the layers and are declared when those land (4d);
 * none is needed for the type layer.
 */

/** DECIDE@IMPL tag A — Signal.raw_payload. */
export const SIGNAL_PAYLOAD_REPR = "unknown (host-shaped raw bytes/values)" as const;
/**
 * Rationale: a Signal is raw host data, not yet meaning; its payload shape is
 * whatever the host emits. We keep it `unknown` at the type layer and let each
 * channel's transducer (T3, DECIDE@IMPL) narrow it. `source_id` is a string,
 * `t` an epoch-millisecond number (matching the store's timestamps).
 */

/** DECIDE@IMPL tag A — InfoUnit.content. */
export const INFOUNIT_CONTENT_REPR = "unknown (referred content)" as const;
/**
 * Rationale: content becomes information only once referred to a frame
 * (INV-4); its concrete shape is environment-specific, kept `unknown` here.
 */

/** DECIDE@IMPL tag A — the reference frame an InfoUnit is referred to. */
export const REF_FRAME_REPR = "{ boundLayer, ref } (lower-layer context handle)" as const;
/**
 * Rationale: meaning is a function of (signal, lower-layer context), so the
 * frame names the lower layer that supplies the context and an identifier of
 * that context. It is a non-null structured handle — the type layer makes
 * `ref_frame` non-nullable, which is where INV-4 is enforced at the type level
 * (a Signal, lacking a frame, is simply not an InfoUnit).
 */

/**
 * DECIDE@IMPL tag B — T2 (Agency Differentiation) thresholds (protocol §6.3).
 *
 * HONEST STATUS: these are NOT derived from first principles — the protocol
 * lists tag B as "not yet derived". They are declared *starting* values for the
 * minimal host, tunable, chosen for plausibility, not fundamental constants.
 * Declared openly here rather than buried in the layer (AGENTS.md "every
 * numeric choice must be traceable to a declared DECIDE@IMPL").
 */

/** Recent emissions T2 matches an observed change against. */
export const MATCHING_WINDOW = 8;
/**
 * Rationale: a small window of the agent's recent emissions, so a change whose
 * effect lags by a few cycles can still be recognised as self-written. Wide
 * enough to tolerate interleaved actions, narrow enough to stay responsive.
 */

/** Cycles of matching before the self/environment line is trusted (leaves UNDECIDED). */
export const STABILITY_THRESHOLD = 3;
/**
 * Rationale: T2 should not commit changes to SELF_WRITTEN/ENV_PUSHED on a single
 * observation; a few cycles of consistent matching must accrue first. Until then
 * agency stays UNDECIDED (the postcondition INV-6 applies only once stable).
 */

/**
 * DECIDE@IMPL tag B — T5 (Temporal Expectation) thresholds (protocol §6.3).
 * Same HONEST STATUS as the T2 thresholds: tunable starting values, not derived.
 */

/** Past observations kept per entity to build its baseline. */
export const BASELINE_WINDOW = 16;
/**
 * Rationale: enough history to characterise an entity's behaviour, bounded so
 * per-entity memory stays finite.
 */

/** Consistent observations before an expectation is trusted (confidence → 1). */
export const SUFFICIENT_RECURRENCE = 3;
/**
 * Rationale: an expectation earns confidence as the same return recurs; below
 * this count it is held with proportionally lower confidence, not asserted.
 */

/** DECIDE@IMPL — T5's expectation-update function. */
export const EXPECTATION_UPDATE_LAW =
  "persistence: predict the most recent observation for the entity" as const;
/**
 * Rationale: the simplest update that satisfies C2 (PredErr falls with
 * repetition against a stable entity) — if an entity keeps returning the same
 * value, the prediction matches and the error goes to zero. A richer update
 * (e.g. moving mode) is a later tuning, declared if adopted.
 */

/** DECIDE@IMPL — GLOB-MOD's concrete representation and update law (protocol §12, INV-7). */
export const GLOB_MOD_REPRESENTATION =
  "ModField.params: Record<string, number> (per-key gains/biases — how to read)" as const;
export const GLOB_MOD_UPDATE_LAW =
  "convex per-key weighted average of a cycle's contributions; untouched keys carry over; effect at N+1" as const;
/**
 * Rationale (the chosen law, "option A" — no inertia constant):
 *   - Each layer contributes a value and a non-negative weight for one or more
 *     param keys during cycle N (INV-7: "one competing parameter; contributions
 *     blend, re-weighted each cycle").
 *   - At the cycle boundary, the next field's value for each contributed key is
 *     the convex weighted average of that cycle's contributions naming the key
 *     (Σ wᵢ·vᵢ / Σ wᵢ). A key no layer contributed simply carries over — that is
 *     "no new disposition information, so no update", not a weighted self-term.
 *   - The blend is applied to a *pending* buffer and becomes the active field
 *     only at N+1; the active field is immutable within its own cycle (INV-7:
 *     "conditions the field only from N+1, never within-cycle").
 *
 * Why no inertia term / no constant: a previous-field inertia weight would be a
 * tag-B constant with no derivation yet (forbidden to invent), and would make
 * the field partly self-constituted, softening the protocol's "constituted by
 * the eight layers → runaway precluded by construction" guarantee. A convex
 * average of the current cycle's contributions keeps that guarantee exact: the
 * result is always within the range of the contributions, so the field cannot
 * amplify itself from within. No gain cap is needed.
 */
