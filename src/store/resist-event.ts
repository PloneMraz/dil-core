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
 * re-stating fixed/open/trace (which could drift), the record embeds the whole
 * scar datum, so the event carries exactly that datum's four fixed tags, its
 * ≥3 open tags (including `domain`, the reason audit-by-class works), and its
 * `layer_trace`. An [event] record therefore carries the same minimum of seven
 * tags as any datum, plus the anchor.
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

export type ActivityRecord = CycleSealActivity | LayerExitActivity | ProvenanceActivity;

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
