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

/** DECIDE@IMPL — the multi-stream activation schedule (protocol §6, cycle-1+). */
export const MULTI_STREAM_SCHEDULE =
  "one topological activation pass per cycle over the fixed T1..T8 dependency DAG; consumption via the meaning-channel (publish/read, INV-3-guarded); cycle-0 runs a direct hand-off pipeline" as const;
/**
 * Rationale: multi-stream is a FLOW-TOPOLOGY property, not OS concurrency —
 * the loop advances in cycle-time, not wall-clock (INV-1 note), so no thread
 * parallelism is claimed or needed. What changes at cycle-1 is the mechanism:
 * consumption, not dispatch — every layer is an active site reading its
 * declared dependency set from the shared meaning-channel, a published datum
 * is consumable by several higher layers at once (T5's one output is read by
 * both T6 and T7), and no dependency is driver-smuggled (T6 reads T2's output
 * itself). The switch at the 0→1 boundary follows §7/§13.3: the self
 * crystallizes at T2 of cycle-0, and multi-stream flow presupposes it. Each
 * cycle's mode is recorded as the open tag `flow`, so it is trace-visible.
 */

/** DECIDE@IMPL tag C — the kind of out-of-loop anchor for Mode-A (protocol §8.3, §12). */
export const APPRAISAL_ANCHOR_KIND = "static" as const;
/** Identifier of the appraisal's criteria source — external to the agent's edited state (INV-8). */
export const APPRAISAL_ANCHOR_ID = "mode-a-static-guide" as const;
/**
 * Rationale + HONEST CAVEAT: the minimal host uses a STATIC external anchor (a
 * frozen Guide) for the appraisal step. Per §8.3 a static anchor reaches only
 * content-degradation — it buys time, it does not cure a systematic lens-bias,
 * because a fixed test is memorizable. It satisfies INV-8 (criteria are frozen
 * against the agent's edits and external to the edited state) but it is NOT a
 * real Mode-B brake. The live Mode-B source (DECIDE@IMPL tag D — user, another
 * agent, or a mix) is deferred to stage 5, where the loop runs continuously and
 * a live Other can be attached. Declared static here, not silently assumed.
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

/**
 * DECIDE@IMPL — the field's axes (protocol §12, INV-7; DIL-en-v7 §2 "What it
 * carries": "the exact axes and their number are DECIDE@IMPL; what is fixed is
 * their kind" — scalar interpretive biases on the gain or threshold of a layer
 * operation). Implemented in field.ts.
 */
export const GLOB_MOD_AXES =
  "trust (how readily a source is trusted), alertness (how alert the loop is to mismatch), exploration (how far it leans toward exploring rather than consolidating); each in [0, 1], NEUTRAL = 0.5" as const;
/**
 * Rationale: the three the specification itself names as examples, and no
 * others — an axis beyond them would be a disposition the protocol never
 * described, invented to fill a slot. Bounded to [0, 1] so the convex blend
 * (GLOB_MOD_UPDATE_LAW) keeps every axis in range with no cap. NEUTRAL is the
 * midpoint: the disposition of a field no layer has leaned.
 *
 * Seed (DIL-en-v7: "at cycle-0 the prior is seeded from the host's existing
 * data"): the host passes its bias as the field's initial params; an axis it
 * does not seed reads NEUTRAL.
 */

/** DECIDE@IMPL — how a layer reads an axis (field.ts `rising`, `falling`, `shiftedCount`). */
export const FIELD_READING_LAW =
  "an axis v shifts a declared threshold or gain by (½ + v) when the operation grows with the axis, by (1½ − v) when it shrinks: the declared value at NEUTRAL, half of it at one end, one and a half at the other; a count threshold never below 1; a floor is raised toward its ceiling, never to it" as const;
/**
 * Rationale: linear and centred on the declared value, so (a) a field that has
 * not leaned leaves every operation exactly as declared — the reference
 * behaviour holds — and (b) the field biases an operation and never annuls or
 * inverts it. DIL-en-v7 §2, "What lies past the modulatory threshold": a field
 * strong enough "not merely to bias but to determine every layer's
 * interpretation" is a halted loop, not a worse one. A gain of 0 — a first
 * version of this law — was exactly that: an appraisal that could no longer
 * weigh any resistance, an attention span of nothing, evidence that no longer
 * accrued, a fit floor above every confidence. The bounds ½ and 1½ keep every
 * operation alive at either end. Tunable, NOT derived.
 */

/** DECIDE@IMPL — what each layer reads and what it votes (field.ts `castVotes`). */
export const FIELD_WIRING =
  "T1 reads trust, votes trust; T2 reads trust, votes alertness; T3 reads exploration, votes exploration; T4 reads trust, votes trust; T5 reads exploration, votes alertness, and hands the field to its rule; T6 reads trust, votes exploration; T7 reads alertness, votes alertness; T8 reads exploration, votes trust and exploration; appraisal reads alertness; forward-building reads exploration" as const;
/**
 * Rationale, layer by layer — each reads the axis that bears on its own
 * operation, and votes from what it alone sees:
 *
 *   T1  reads trust: how many silent cycles it holds the environment confirmed
 *       (T1_GRACE_MAX). Votes trust: 1 when the region said anything this
 *       cycle, 0 when it said nothing.
 *   T2  reads trust: how far back an emission is still matched as the cause of a
 *       change (MATCHING_WINDOW). Not STABILITY_THRESHOLD: once T2 is stable
 *       nothing may leave UNDECIDED again (INV-6), and a threshold that moved
 *       could put it back. Votes alertness: the share of classified changes the
 *       region pushed.
 *   T3  reads exploration: whether a cue already asked is asked again
 *       (T3_REASK_AFTER). Votes exploration: the share of this cycle's cues
 *       never asked before.
 *   T4  reads trust: how many sightings before a named entity is bound by its
 *       name rather than STRANGER (T4_RECOGNITION). Votes trust: the share of
 *       arrivals bound to a known entity.
 *   T5  reads exploration: how long a baseline it keeps (BASELINE_WINDOW) —
 *       exploring keeps less, consolidating more. Not alertness into
 *       SUFFICIENT_RECURRENCE: a confidence the field slowed would fail §13.4's
 *       accumulation reading (store/decisions.ts FIT_FLOOR). Its rule — where
 *       the mind sits — receives the field whole. Votes alertness: the share
 *       of entities whose return mismatched.
 *   T6  reads trust: how much one resistance or one pushed change counts as
 *       evidence of an independent Other. Votes exploration: the share of this
 *       cycle's Others met for the first time.
 *   T7  reads alertness: how long an entity stays demanded back after it was
 *       last seen (the attention span). Votes alertness: the share of attended
 *       entities that fell silent.
 *   T8  reads exploration: how deep it compares Others when ranking them
 *       (T8_COMPARISON). Votes trust: how evenly resistance is spread across the
 *       Others (1 − the share of the most-resisting one); votes exploration: how
 *       many Other↔Other interactions per Other. DIL-en-v7 §7 routes T8's
 *       feedback "by content, e.g. GeneralOther to T4, RelValue/SocialEdge to
 *       T6": both read trust, which T8 feeds.
 *   appraisal reads alertness: the gain on the resistance met.
 *   forward-building reads exploration: how many situations it builds (H_COUNT)
 *       and the fit floor under them (FIT_FLOOR).
 *
 * Every axis is read by at least two operations and fed by at least two layers,
 * so no key in the field is carried without being read, and none read without
 * being fed. Tunable, NOT derived.
 */

/** DECIDE@IMPL tag B — the longest run of silent cycles T1 holds the environment confirmed through. */
export const T1_GRACE_MAX = 2;
/**
 * Rationale: T1 confirms "that an activity-environment is present". A single
 * silence against a background of returns is not the environment's absence
 * (protocol §4: it is a mismatch, registered at T7). How many silent cycles it
 * holds through is trust's: none at NEUTRAL or below (the reference behaviour:
 * confirmed only when the region said something), up to T1_GRACE_MAX at full
 * trust. Tunable, NOT derived.
 */

/** DECIDE@IMPL tag B — the span after which a cue asked before is asked again, leaning to explore. */
export const T3_REASK_AFTER = 16;
/**
 * Rationale: T3 asks the store once per cue, and at NEUTRAL or below it never
 * asks again (the reference behaviour: a cue asked has been answered). Leaning
 * to explore, it asks again after T3_REASK_AFTER · (1½ − exploration) cycles, by
 * which time the store may hold more under that cue. The same length as
 * BASELINE_WINDOW, the loop's other declared memory span; not derived.
 */

/** DECIDE@IMPL tag B — sightings before a named entity is bound by its name, at NEUTRAL. */
export const T4_RECOGNITION = 1;
/**
 * Rationale: the reference binds a named entity at once. With less trust it
 * takes more sightings (T4_RECOGNITION · (1½ − trust), rounded, never below 1); with
 * more, never fewer than one. Until then the arrival is bound to STRANGER — a
 * positional unknown, not a loss: it is still registered.
 */

/** DECIDE@IMPL — how deep T8 compares Others, by exploration. */
export const T8_COMPARISON =
  "by resistance; leaning to explore (exploration > NEUTRAL), by resistance and then by pushed changes" as const;
/**
 * Rationale: the reference ranks by resistance alone. Exploring, it compares on
 * one more dimension of the independence evidence T6 accrued, so Others equal
 * in resistance are told apart. Tunable, NOT derived.
 */
