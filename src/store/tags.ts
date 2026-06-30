/**
 * The tag schema (protocol §9).
 *
 * Every datum carries a FIXED layer of four tags, in fixed order, never
 * overwritten:
 *   (1) timestamp, (2) cycle-mark, (3) provenance, (4) floor-tag.
 * Every layer T1–T8 stamps a floor-tag; there are no pass-through layers.
 *
 * On top of the fixed layer, every datum MUST carry at least the open tag
 * `domain` (the class of data it is), so the `[event]` log is auditable by data
 * class. The agent MAY mint further OPEN tags denoting *what* the datum is
 * (format, platform, object) — but never its quality, correctness, or value.
 * Open tags other than `domain` may be added, removed, or varied by data type;
 * `domain` MUST be present. Open tags never overwrite the fixed layer.
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
 * Open tags: descriptive only (protocol §9, "Open-tag discipline").
 *
 * A key names a descriptive *dimension* of the datum (what it is); the value is
 * its setting on that dimension. Two rules govern the layer and nothing more:
 *   - a key MUST denote the same dimension wherever it appears (consistency, so
 *     the [event] log is filterable by an auditor);
 *   - no tag MAY name a verdict (quality, correctness, value).
 * There is no fixed industry vocabulary and no required number of tags: which
 * keys exist beyond the mandatory `domain` is declared per deployment
 * (decisions.ts OPEN_TAG_REGISTRY), not enumerated here.
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
 * Open-tag keys that MUST be present on every datum (protocol §9, open layer).
 * `domain` is mandatory so the `[event]` log is auditable by data class.
 */
export const REQUIRED_OPEN_TAG_KEYS = ["domain"] as const;

/**
 * Validate the open-tag layer against both schema rules: it must carry every
 * required key (domain) and no forbidden verdict key. Returns the reason a set
 * is invalid, or null if it is acceptable. (The tagging-gate enforces this; kept
 * here beside the schema it defends.)
 */
export function invalidOpenTagReason(open: OpenTags): string | null {
  for (const required of REQUIRED_OPEN_TAG_KEYS) {
    const present =
      Object.prototype.hasOwnProperty.call(open, required) &&
      open[required] !== undefined &&
      open[required] !== "";
    if (!present) {
      return `open tag "${required}" is required for auditability but is missing`;
    }
  }
  for (const key of Object.keys(open)) {
    if (FORBIDDEN_OPEN_TAG_KEYS.has(key.toLowerCase())) {
      return `open tag "${key}" names a verdict (quality/correctness/value), which the schema forbids`;
    }
  }
  return null;
}
