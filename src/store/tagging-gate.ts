/**
 * The tagging-gate — no side door (protocol §9, AGENTS.md "[event] log").
 *
 * Host data (a pre-existing memory file, say) is admitted to the loop ONLY after
 * passing the tagging rule: stamped provenance `prior`, with NO cycle-mark until
 * it has run, plus the open-tag layer — which MUST include the mandatory
 * `domain` tag (protocol §9) and MUST NOT name a verdict. Untagged data MUST NOT
 * enter the loop. There is no other way in.
 *
 * Admission failure is a halt (a thrown error), not a silent drop: data that
 * cannot be admitted cleanly must not slip into the store half-stamped.
 */

import { invalidOpenTagReason, type OpenTags, type TaggedDatum } from "./tags.js";
import type { LayerIndex } from "../invariants/types.js";

export class TaggingGateError extends Error {
  constructor(detail: string) {
    super(`tagging-gate rejected admission: ${detail}`);
    this.name = "TaggingGateError";
    Object.setPrototypeOf(this, TaggingGateError.prototype);
  }
}

/** Raw host data offered for admission. */
export interface HostDatum<T = unknown> {
  readonly payload: T;
  /** The layer admitting it (T1 ingestion, normally). */
  readonly admittingLayer: LayerIndex;
  /**
   * Descriptive open tags. MUST include `domain`; never verdict tags. Admission
   * fails if `domain` is missing or any key names a verdict.
   */
  readonly open: OpenTags;
}

/**
 * Admit host data through the tagging-gate. On success the datum leaves stamped
 * as `prior`: timestamp set, cycle-mark null (it has not run), floor-tag = the
 * admitting layer, provenance = "prior". Throws TaggingGateError if the open
 * tags carry a forbidden verdict dimension.
 */
export function admitHostData<T>(
  datum: HostDatum<T>,
  now: number,
): TaggedDatum<T> {
  const open: OpenTags = datum.open;
  const bad = invalidOpenTagReason(open);
  if (bad !== null) {
    throw new TaggingGateError(bad);
  }
  return {
    payload: datum.payload,
    fixed: {
      timestamp: now,
      cycleMark: null, // a `prior` bears no cycle-mark until it has run
      provenance: "prior",
      floorTag: datum.admittingLayer,
    },
    open,
    // The layer_trace begins at the admitting layer; later layers append (§6.1).
    trace: [datum.admittingLayer],
  };
}
