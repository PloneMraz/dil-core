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
import type { FixedTags } from "./tags.js";

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
 * An [event] record: the ResistEvent, its fixed tags, and its context anchor.
 * Once written to the [event] log it is read-only forever (event-log.ts).
 */
export interface EventRecord {
  readonly event: ResistEvent;
  readonly fixed: FixedTags;
  readonly anchor: ContextAnchor;
}
