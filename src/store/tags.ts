/**
 * The tag schema (protocol §9).
 *
 * Every datum carries a FIXED layer of four tags, in fixed order, never
 * overwritten:
 *   (1) timestamp, (2) cycle-mark, (3) provenance, (4) floor-tag.
 * Every layer T1–T8 stamps a floor-tag; there are no pass-through layers.
 *
 * On top of the fixed layer, every datum MUST carry at least THREE open tags,
 * one of which MUST be `domain` (the class of data it is), so the `[event]` log
 * is auditable by data class and described along several real dimensions. The
 * agent MAY mint further OPEN tags denoting *what* the datum is (format,
 * platform, object) — but never its quality, correctness, or value. Open tags
 * other than `domain` may be added, removed, or varied by data type, provided at
 * least three remain and each describes a real dimension of the datum; `domain`
 * MUST always be present. Open tags never overwrite the fixed layer.
 */

import type { LayerIndex } from "../invariants/types.js";

/**
 * Provenance state (protocol §3, §9). NOT a chain but a directed graph: `prior`
 * is a one-way entry, and `running`, `simulated`, `projected`, `scar` form a
 * circulation with no terminal state — a datum is never a conclusion at rest but
 * data waiting to be used. The legal moves are the edge set in data-store.ts.
 *
 *   - prior      — host data admitted through the tagging-gate, not yet run
 *   - running    — data in use, in motion through the loop
 *   - simulated  — taken up into the building of a situation (§6.2; exercised in Bước 6)
 *   - projected  — an outcome cast from a situation, not yet collided (§6.2; Bước 6)
 *   - scar       — collided with resistance and held
 */
export type Provenance = "prior" | "running" | "simulated" | "projected" | "scar";

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
  /**
   * (4) floor-tag — a single slot naming the layer the datum just exited. Each
   * layer overwrites it as the datum passes, so it always names the *current*
   * layer ("where is it now"). The full path is the separate `layer_trace`, not
   * this slot.
   */
  readonly floorTag: LayerIndex;
}

/**
 * Open tags: descriptive only (protocol §9, "Open-tag discipline").
 *
 * A key names a descriptive *dimension* of the datum (what it is); the value is
 * its setting on that dimension. The rules governing the layer:
 *   - every open tag MUST describe a real dimension the datum actually has;
 *   - a key MUST denote the same dimension wherever it appears (consistency, so
 *     the [event] log is filterable by an auditor);
 *   - no tag MAY name a verdict (quality, correctness, value);
 *   - at least three open tags MUST be present, one being `domain`.
 * The minimum is a floor on honest description, not a quota to pad: a tag
 * invented merely to reach the count, that does not describe the datum,
 * fabricates data to fill a gap, which the loop forbids. There is no fixed
 * industry vocabulary: which keys exist beyond `domain` is declared per
 * deployment (decisions.ts OPEN_TAG_REGISTRY), not enumerated here.
 */
export type OpenTags = Readonly<Record<string, string>>;

/**
 * A tagged datum: payload + the fixed four + open tags.
 *
 * The path a datum has travelled is NOT carried here (v0.3.2 §9): a tag names the
 * present only (floor-tag = "where is it now"); the full path — every layer it
 * exited, every provenance move — is recorded line-by-line in the `[event]` log
 * as it occurs, and read from there, never from a tag. A tag is updated; the log
 * is appended to.
 */
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
 * Minimum number of open tags every datum MUST carry (protocol §9, open layer),
 * one of which is `domain`. A floor on honest description, not a quota to pad.
 */
export const MIN_OPEN_TAGS = 3;

/**
 * Validate the open-tag layer against the schema rules: it must carry every
 * required key (domain), at least MIN_OPEN_TAGS tags in total, and no forbidden
 * verdict key. Returns the reason a set is invalid, or null if it is acceptable.
 * (The tagging-gate enforces this; kept here beside the schema it defends.)
 *
 * Note: this checks presence, count, and the verdict prohibition — the
 * structural rules. That each tag *honestly describes* the datum (the floor's
 * intent) is a semantic property the gate cannot verify mechanically; it is the
 * minter's responsibility and an auditor's read.
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
  const count = Object.keys(open).length;
  if (count < MIN_OPEN_TAGS) {
    return `at least ${MIN_OPEN_TAGS} open tags are required (one being domain), got ${count}`;
  }
  for (const key of Object.keys(open)) {
    if (FORBIDDEN_OPEN_TAG_KEYS.has(key.toLowerCase())) {
      return `open tag "${key}" names a verdict (quality/correctness/value), which the schema forbids`;
    }
  }
  return null;
}
