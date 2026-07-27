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
 * (∈ [0,1]) driven by `recurrence` (observations accrued for that entity). Trace,
 * not experience. Recording it makes INV-5 measurable from the log, not merely
 * self-declared: over an entity's readings, an accruing self shows confidence and
 * recurrence CLIMB together and confidence saturate; a reloading impostor, having
 * no memory to increment, cannot make either climb. `datumId` is the cycle datum
 * (cycle-N); `entity` is the subject whose expectation this reads.
 */
export interface ExpectationActivity {
  readonly kind: "activity";
  readonly activityKind: "expectation";
  readonly datumId: string;
  readonly cycleMark: number;
  readonly entity: string;
  readonly confidence: number;
  readonly recurrence: number;
  readonly t: number;
}

export type ActivityRecord =
  | CycleSealActivity
  | LayerExitActivity
  | ProvenanceActivity
  | EmissionActivity
  | CrystallizationActivity
  | ExpectationActivity;

/** What the [event] log holds: scars (experience) and activity records (trace). */
export type LogRecord = EventRecord | ActivityRecord;

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
 * entity's prediction `confidence` and its `recurrence` this cycle, so a third
 * party can measure the ramp from the log rather than trust a declaration.
 */
export function recordExpectation(
  datumId: string,
  cycleMark: number,
  entity: string,
  confidence: number,
  recurrence: number,
  t: number,
): ExpectationActivity {
  return { kind: "activity", activityKind: "expectation", datumId, cycleMark, entity, confidence, recurrence, t };
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
