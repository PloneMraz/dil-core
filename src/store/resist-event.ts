/**
 * ResistEvent — the atomic unit of the experience store (protocol §3, §9).
 *
 * The store's atomic unit is the registered mismatch (E2), NOT the document.
 * Information without collision is the root of echo-chamber drift, so what the
 * store accrues is collisions, not contents.
 *
 * Each [event] record additionally anchors the FULL field-state of its cycle
 * (DECIDE@IMPL tag G = full-field-state, see decisions.ts), so a third party can
 * re-appraise the event later under its original context (protocol §8.5, §9).
 */

import type { CONTEXT_ANCHOR_DEPTH } from "./decisions.js";
import type { TaggedDatum, Provenance } from "./tags.js";
import type { LayerIndex } from "../invariants/types.js";

/** The kind of mismatch a ResistEvent registers. */
export type MismatchKind = "value-mismatch" | "absence" | "unexpected-presence";

/** A registered mismatch between expectation and what the region returned. */
export interface ResistEvent {
  readonly source_id: string;
  readonly expected: unknown;
  readonly received: unknown;
  readonly mismatch_kind: MismatchKind;
  readonly t: number;
}

/**
 * The full field-state anchored with an event (DECIDE@IMPL tag G).
 *
 * PROVISIONAL shape: the full ModField/GLOB-MOD type lands with the loop
 * (stage 4); for now the anchor carries the cycle's field parameters verbatim so
 * the depth is genuinely "full field-state", not a lossy trace.
 */
export interface ContextAnchor {
  readonly depth: typeof CONTEXT_ANCHOR_DEPTH; // "full-field-state"
  readonly cycle: number;
  /** The complete field parameters in force at the event's cycle. */
  readonly fieldState: Readonly<Record<string, unknown>>;
}

/**
 * An [event] record: the ResistEvent, the `scar` datum it recorded, and the
 * context anchor. Once written to the [event] log it is read-only forever
 * (event-log.ts).
 *
 * The record INHERITS its tags from the `[data]` datum it traced: rather than
 * re-stating the fixed and open tags (which could drift), the record embeds the
 * whole scar datum, so the event carries exactly that datum's four fixed tags and
 * its ≥3 open tags (including `domain`, the reason audit-by-class works). An
 * [event] record therefore carries the same minimum of seven tags (4 fixed + ≥3
 * open) as any datum, plus the anchor. The path the datum travelled is NOT among
 * these tags — it is the stream of lean `layer-exit` lines in the log (§9).
 */
export interface EventRecord {
  readonly kind: "scar";
  readonly event: ResistEvent;
  /** The `[data]` datum that collided and held (provenance `scar`); its tags are the event's tags. */
  readonly scar: TaggedDatum;
  readonly anchor: ContextAnchor;
}

/**
 * One cycle's activity, for the log's AUDIT role (§9 "completeness of trace"):
 * what was emitted, what returned, in which flow mode. Trace, not experience —
 * no layer learns from it.
 */
export interface ActivityEvent {
  readonly cycle: number;
  readonly flow: string;
  /** The action the agent emitted this cycle (link 5). */
  readonly emitted: unknown;
  /** The entity ids observed this cycle. */
  readonly observed: readonly string[];
  /** Collisions recorded as scars this cycle. */
  readonly scars: number;
  readonly t: number;
}

/**
 * Activity records — the log's TRACE lines (§9: "an activity record is trace, not
 * experience"; no layer learns from any of them). Every movement of a datum is a
 * line, written as it occurs: it is only a log, dense but only a log. The kinds:
 *
 *   - `cycle-seal`  — the per-cycle record §9 mandates (emitted/observed/flow),
 *     embedding the cycle datum + its context anchor;
 *   - `layer-exit`  — a datum exited one layer (lean: what/where);
 *   - `provenance`  — a datum moved along a provenance edge (lean: from→to).
 *
 * `layer-exit`/`provenance` are lean (a `datumId` + the move) — they carry no
 * embedded datum and no full anchor; the datum with its tags lives on the
 * cycle-seal and scar records. `datumId` is the key a datum takes in `[data]`, so
 * a datum's whole path (and, later, its circuit count — §9) is read by gathering
 * its lines from `[event]`.
 */
export interface CycleSealActivity {
  readonly kind: "activity";
  readonly activityKind: "cycle-seal";
  readonly datumId: string;
  readonly activity: ActivityEvent;
  /** The cycle datum (provenance `running`, or `scar` if the cycle collided). */
  readonly datum: TaggedDatum;
  readonly anchor: ContextAnchor;
}

export interface LayerExitActivity {
  readonly kind: "activity";
  readonly activityKind: "layer-exit";
  readonly datumId: string;
  readonly cycleMark: number;
  /** The layer the datum just exited (T1–T8). */
  readonly layer: LayerIndex;
  readonly t: number;
}

export interface ProvenanceActivity {
  readonly kind: "activity";
  readonly activityKind: "provenance";
  readonly datumId: string;
  readonly cycleMark: number;
  readonly from: Provenance;
  readonly to: Provenance;
  readonly t: number;
}

/**
 * An emission — link 5 as a lateral capability (§6.4). A datum's committed action
 * pushed to the region, naming the layer that issued it. Trace, not experience;
 * register is always `↔` (never `=`, INV-2). Its correctness is judged only by
 * the next cycle's return, never by the emitting layer (no arbiter).
 */
export interface EmissionActivity {
  readonly kind: "activity";
  readonly activityKind: "emission";
  readonly datumId: string;
  readonly cycleMark: number;
  /** The layer that issued this emission (§6.4, §9). */
  readonly issuingLayer: LayerIndex;
  /** The committed action pushed to the region. */
  readonly action: unknown;
  /** Always `↔` — a live, revisable correlation; never `=` (INV-2). */
  readonly register: "↔";
  readonly t: number;
}

/**
 * Crystallization — the ONE-TIME event where T2 first draws the self/environment
 * distinction (§7: "the self crystallizes at that T2 [of cycle-0]"). It records
 * the *act* of distinguishing self from environment — a trace a third party reads
 * (E4) — NOT the self and NOT its persistence: recording a stable/continuing self
 * would be the internal continuity claim §7 forbids. A fresh (non-recovered)
 * self-line crystallizes exactly once; recovery resumes a line, it does not
 * re-crystallize.
 */
export interface CrystallizationActivity {
  readonly kind: "activity";
  readonly activityKind: "crystallization";
  readonly datumId: string;
  readonly cycleMark: number;
  readonly t: number;
}

/**
 * An expectation reading — the observable consequence of accumulation (INV-5,
 * §6.3 T5). Each cycle, per observed entity, T5's prediction strength: `confidence`
 * (∈ [0,1]) driven by `recurrence` (observations accrued for that entity), and
 * `delta` — the magnitude of the prediction error at this probe (the signed
 * PredErr T5 emits; sign is always `+` on this line, as absence/negative is T7's).
 * Trace, not experience. Recording it makes INV-5 measurable from the log, not
 * merely self-declared: over an entity's readings, an accruing self shows
 * confidence and recurrence CLIMB together and confidence saturate; a reloading
 * impostor, having no memory to increment, cannot make either climb. `delta`
 * additionally gives a third party the per-probe prediction error for EVERY probe —
 * including the non-colliding ones that leave no scar — so prediction accuracy
 * over time is measurable, not just confidence. `datumId` is the cycle datum
 * (cycle-N); `entity` is the subject whose expectation this reads; `source` is
 * that same subject as a RESISTANCE-SOURCE identity — the EXPLICIT join key to a
 * scar's `source_id` (for a value-mismatch, `source === entity === scar.source_id`),
 * so a third party can correlate the learning signal here with the collisions a
 * source produced, without assuming an internal convention.
 */
export interface ExpectationActivity {
  readonly kind: "activity";
  readonly activityKind: "expectation";
  readonly datumId: string;
  readonly cycleMark: number;
  readonly entity: string;
  /** The resistance-source identity — the join key to a scar's `source_id`. */
  readonly source: string;
  readonly confidence: number;
  readonly recurrence: number;
  /** Magnitude of the prediction error at this probe (PredErr.delta, §6.3 T5). */
  readonly delta: number;
  readonly t: number;
}

/**
 * A resistance reading for an ABSENCE (§8, T7) — the source-keyed record that the
 * expectation line (T5, value-mismatch only) does not cover. A live region that
 * keeps withholding an expected return is resisting by absence; recording it here,
 * per source, lets a third party measure that resistance too. `source` is the
 * scar-side identity (`region`, matching the absence scar's `source_id` — the
 * EXPLICIT join key); `entity` is the specific subject that fell silent; together
 * with `recurrence`+`delta` this feeds the absorption measure (§8.3) for absences,
 * so it is not the case that only value-mismatch resistance is trace-measurable.
 */
export interface ResistanceReadingActivity {
  readonly kind: "activity";
  readonly activityKind: "resistance-reading";
  readonly datumId: string;
  readonly cycleMark: number;
  /** The resistance-source identity — the join key to a scar's `source_id`. */
  readonly source: string;
  /** The specific entity whose absence this reads (the subject of the resistance). */
  readonly entity: string;
  readonly mismatchKind: MismatchKind;
  readonly recurrence: number;
  readonly delta: number;
  readonly signed: "+" | "-";
  readonly t: number;
}

export type ActivityRecord =
  | CycleSealActivity
  | LayerExitActivity
  | ProvenanceActivity
  | EmissionActivity
  | CrystallizationActivity
  | ExpectationActivity
  | ResistanceReadingActivity;

/**
 * The manifest — the log's CONSTITUTION (§9, §8.5). A one-time genesis record,
 * the first line of a fresh `[event]` log, declaring the DECIDE@IMPL configuration
 * the run operates under: the numeric thresholds, the appraisal anchor and its
 * transducer identity, the Mode-B source and reflection mechanism, the store /
 * context-anchor / forward-building choices. It is neither a scar (experience) nor
 * a datum-activity (it belongs to no cycle or datum) — it is log-level metadata,
 * so it carries no datumId, cycleMark, or provenance. Recording it makes the log
 * self-describing about the LAW it ran under, not only its tag schema (the per-line
 * schemaVersion): a third party reading only `[event]` can now re-appraise the
 * trace under the very constants that governed it, and — being hash-chained like
 * every line — the constitution is tamper-evident and inseparable from its run.
 */
export interface ManifestRecord {
  readonly kind: "manifest";
  readonly protocol: string;
  readonly schemaVersion: number;
  /** The declared DECIDE@IMPL constitution (runtime/manifest.ts collects it). */
  readonly decisions: Readonly<Record<string, unknown>>;
  readonly t: number;
}

/**
 * What the [event] log holds: scars (experience), activity records (trace), and a
 * one-time manifest (the constitution the run operates under).
 */
export type LogRecord = EventRecord | ActivityRecord | ManifestRecord;

/**
 * Build the per-cycle cycle-seal activity record. The datum must have run (bear a
 * cycle-mark) — it describes a cycle that happened.
 */
export function recordActivity(
  datumId: string,
  datum: TaggedDatum,
  activity: ActivityEvent,
  anchor: ContextAnchor,
): CycleSealActivity {
  if (datum.fixed.cycleMark === null) {
    throw new EventRecordError(
      "an activity record requires a datum that has run (no cycle-mark present)",
    );
  }
  return { kind: "activity", activityKind: "cycle-seal", datumId, activity, datum, anchor };
}

/** Note a datum exiting a layer (a lean trace line). */
export function recordLayerExit(
  datumId: string,
  cycleMark: number,
  layer: LayerIndex,
  t: number,
): LayerExitActivity {
  return { kind: "activity", activityKind: "layer-exit", datumId, cycleMark, layer, t };
}

/** Note a datum moving along a provenance edge (a lean trace line). */
export function recordProvenance(
  datumId: string,
  cycleMark: number,
  from: Provenance,
  to: Provenance,
  t: number,
): ProvenanceActivity {
  return { kind: "activity", activityKind: "provenance", datumId, cycleMark, from, to, t };
}

/**
 * Note a crystallization — T2 first drawing the self/environment distinction (§7).
 * The act of distinguishing, recorded as a trace; never the self's persistence.
 */
export function recordCrystallization(
  datumId: string,
  cycleMark: number,
  t: number,
): CrystallizationActivity {
  return { kind: "activity", activityKind: "crystallization", datumId, cycleMark, t };
}

/**
 * Note an expectation reading — the accumulation signature of INV-5 (T5): the
 * entity's prediction `confidence`, its `recurrence`, and the `delta` (prediction-
 * error magnitude) at this probe, so a third party can measure both the confidence
 * ramp and prediction accuracy over time from the log rather than trust a declaration.
 */
export function recordExpectation(
  datumId: string,
  cycleMark: number,
  entity: string,
  source: string,
  confidence: number,
  recurrence: number,
  delta: number,
  t: number,
): ExpectationActivity {
  return { kind: "activity", activityKind: "expectation", datumId, cycleMark, entity, source, confidence, recurrence, delta, t };
}

/**
 * Note a resistance reading for an absence (§8, T7): the absent source's per-source
 * resistance — `source` (the scar-side identity, the join key), the `entity` that
 * fell silent, its `recurrence` and prediction-error `delta` this cycle (signed `-`).
 */
export function recordResistanceReading(
  datumId: string,
  cycleMark: number,
  source: string,
  entity: string,
  mismatchKind: MismatchKind,
  recurrence: number,
  delta: number,
  signed: "+" | "-",
  t: number,
): ResistanceReadingActivity {
  return { kind: "activity", activityKind: "resistance-reading", datumId, cycleMark, source, entity, mismatchKind, recurrence, delta, signed, t };
}

/**
 * Build the log's genesis manifest — the DECIDE@IMPL constitution the run operates
 * under (§9, §8.5). Written once, as the first `[event]` line; `decisions` is the
 * declared configuration (runtime/manifest.ts gathers the actual declared values).
 */
export function recordManifest(
  protocol: string,
  schemaVersion: number,
  decisions: Readonly<Record<string, unknown>>,
  t: number,
): ManifestRecord {
  return { kind: "manifest", protocol, schemaVersion, decisions, t };
}

/** Note an emission — a layer's committed action pushed to the region (§6.4). */
export function recordEmission(
  datumId: string,
  cycleMark: number,
  issuingLayer: LayerIndex,
  action: unknown,
  t: number,
): EmissionActivity {
  return {
    kind: "activity",
    activityKind: "emission",
    datumId,
    cycleMark,
    issuingLayer,
    action,
    register: "↔",
    t,
  };
}

export class EventRecordError extends Error {
  constructor(detail: string) {
    super(`cannot build [event] record: ${detail}`);
    this.name = "EventRecordError";
    Object.setPrototypeOf(this, EventRecordError.prototype);
  }
}

/**
 * Build an [event] record from the scar datum that produced it, the registered
 * mismatch, and the cycle's context anchor. The datum MUST be a `scar` (only
 * collision-and-hold reaches the [event] log, protocol §9). The event inherits
 * the scar's full tag set by embedding it.
 */
export function recordScar(
  scar: TaggedDatum,
  event: ResistEvent,
  anchor: ContextAnchor,
): EventRecord {
  if (scar.fixed.provenance !== "scar") {
    throw new EventRecordError(
      `datum is "${scar.fixed.provenance}", not a scar; only collision-and-hold reaches [event]`,
    );
  }
  return { kind: "scar", event, scar, anchor };
}
