/**
 * The tag schema (protocol §9).
 *
 * Every datum carries a FIXED layer of four tags, in fixed order, never
 * overwritten:
 *   (1) timestamp, (2) cycle-mark, (3) provenance, (4) floor-tag.
 * Every layer T1–T8 stamps a floor-tag; there are no pass-through layers.
 *
 * On top of the fixed layer the agent MAY mint OPEN tags denoting *what* the
 * datum is (format, platform, domain, object) — but never its quality,
 * correctness, or value. Open tags may be added or removed; they never overwrite
 * the fixed layer.
 */

import type { LayerIndex } from "../invariants/types.js";

/** Provenance state (protocol §3, §9). The lifecycle is prior → running → scar. */
export type Provenance = "prior" | "running" | "scar";

/**
 * The fixed four tags. `cycleMark` is null until the datum has run (a `prior`
 * bears no cycle-mark). `floorTag` is the layer the datum just exited.
 */
export interface FixedTags {
  /** (1) timestamp — when the datum was stamped. */
  readonly timestamp: number;
  /** (2) cycle-mark — the cycle in which it ran; null while still `prior`. */
  readonly cycleMark: number | null;
  /** (3) provenance — prior | running | scar. */
  readonly provenance: Provenance;
  /** (4) floor-tag — the layer that last stamped this datum. */
  readonly floorTag: LayerIndex;
}

/**
 * Open tags: descriptive only. The schema forbids quality/correctness/value
 * tags here — the store records origin, never a verdict (protocol §9). Keys are
 * descriptive dimensions (e.g. "format", "domain"); values are their settings.
 */
export type OpenTags = Readonly<Record<string, string>>;

/** A tagged datum: payload + the fixed four + any open tags. */
export interface TaggedDatum<T = unknown> {
  readonly payload: T;
  readonly fixed: FixedTags;
  readonly open: OpenTags;
}

/** Open-tag keys that name a verdict are forbidden (protocol §9). */
const FORBIDDEN_OPEN_TAG_KEYS = new Set([
  "quality",
  "correctness",
  "value",
  "valence",
  "good",
  "bad",
]);

/**
 * Validate open tags carry no verdict dimension. Returns the reason a set is
 * invalid, or null if it is acceptable. (The tagging-gate enforces this; kept
 * here beside the schema it defends.)
 */
export function invalidOpenTagReason(open: OpenTags): string | null {
  for (const key of Object.keys(open)) {
    if (FORBIDDEN_OPEN_TAG_KEYS.has(key.toLowerCase())) {
      return `open tag "${key}" names a verdict (quality/correctness/value), which the schema forbids`;
    }
  }
  return null;
}
