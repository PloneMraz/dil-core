/**
 * The tagging-gate — no side door (protocol §9, AGENTS.md "[event] log").
 *
 * Every datum enters the store ONLY after passing the tagging rule: the four
 * fixed tags plus the open-tag layer — which MUST include the mandatory `domain`
 * tag (protocol §9) and MUST NOT name a verdict. Untagged data MUST NOT enter the
 * loop. There is no other way in. What a datum is stamped depends on where it
 * comes from (v0.3.3):
 *   - host data existing before the loop ran → `prior`, no cycle-mark until it
 *     has run (`admitHostData`);
 *   - a datum the agent writes anew → `nascent`, bearing the cycle-mark of the
 *     cycle that wrote it (`admitNascent`);
 *   - what the region returns while the loop runs, and the loop's own per-cycle
 *     datum → `running`, in use the moment they arrive, told apart by `domain`
 *     (`admitArrival`).
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
  };
}

function checkedOpen(open: OpenTags): OpenTags {
  const bad = invalidOpenTagReason(open);
  if (bad !== null) throw new TaggingGateError(bad);
  return open;
}

/**
 * Admit a datum the agent has written anew (v0.3.3 `nascent`). It bears the
 * cycle-mark of the cycle that wrote it from the start, and moves
 * `nascent → running` once it has run.
 */
export function admitNascent<T>(datum: HostDatum<T>, now: number, cycle: number): TaggedDatum<T> {
  return {
    payload: datum.payload,
    fixed: { timestamp: now, cycleMark: cycle, provenance: "nascent", floorTag: datum.admittingLayer },
    open: checkedOpen(datum.open),
  };
}

/**
 * Admit what arrives while the loop runs — a return from the region, or the
 * loop's own per-cycle datum (v0.3.3). It is in use the moment it arrives, so it
 * enters at `running`, bearing the cycle it arrived in; which class of data it is,
 * is read from its `domain`, not from its provenance.
 */
export function admitArrival<T>(datum: HostDatum<T>, now: number, cycle: number): TaggedDatum<T> {
  return {
    payload: datum.payload,
    fixed: { timestamp: now, cycleMark: cycle, provenance: "running", floorTag: datum.admittingLayer },
    open: checkedOpen(datum.open),
  };
}
