/**
 * The field's axes — what GLOB-MOD carries, and how a layer reads and feeds it
 * (protocol §5 INV-7; parent specification DIL-en-v7 §2, "What it carries").
 *
 * WHAT THE FIELD IS. "A global interpretive prior: a single background state,
 * shared by every layer in a cycle, setting the disposition with which each
 * layer reads its input. It carries how to read, never what is read." Its params
 * are "scalar interpretive biases — each one modulating the gain or threshold of
 * some layer operation (how readily a source is trusted, how alert the loop is to
 * mismatch, how far it leans toward exploring rather than consolidating)". The
 * axes and their number are DECIDE@IMPL; their kind is fixed.
 *
 * THE AXES (declared, decisions.ts GLOB_MOD_AXES): the three the specification
 * names, and no others — `trust`, `alertness`, `exploration` — each in [0, 1],
 * with NEUTRAL (0.5) the disposition of a field no layer has yet leaned.
 *
 * HOW A LAYER READS. Each layer reads the axis that bears on its own operation,
 * and the axis shifts that operation's declared threshold or gain (§6: "a global
 * gain and bias shifting every link's parameters at once"). At NEUTRAL, and in a
 * field that carries no axes, every operation is exactly the declared one — so a
 * loop whose field has not leaned behaves as the reference always did.
 *
 * HOW A LAYER FEEDS. Each layer votes on an axis from what it alone sees this
 * cycle, a value in [0, 1]; the votes on a key blend convexly (INV-7, the update
 * law in glob-mod.ts) and condition the field from N+1. A layer with nothing to
 * see on an axis this cycle casts no vote, and the axis carries over. What a
 * layer sees (a count, a share) is never put in the field itself: that would be
 * what is read, not how to read.
 */

import type { ContributeFn } from "./layer.js";
import type { ModField } from "./types.js";

/** How readily a source is trusted. */
export const TRUST = "trust";
/** How alert the loop is to mismatch. */
export const ALERTNESS = "alertness";
/** How far the loop leans toward exploring rather than consolidating. */
export const EXPLORATION = "exploration";

export type Axis = typeof TRUST | typeof ALERTNESS | typeof EXPLORATION;

export const AXES: readonly Axis[] = [TRUST, ALERTNESS, EXPLORATION];

/** The disposition of an axis no layer has leaned: the declared operation, unshifted. */
export const NEUTRAL = 0.5;

/** The value of an axis in a field, in [0, 1]; NEUTRAL when the field carries none. */
export function axis(field: ModField | undefined, name: Axis): number {
  const v = field?.params[name];
  if (typeof v !== "number" || !Number.isFinite(v)) return NEUTRAL;
  return Math.min(1, Math.max(0, v));
}

/**
 * The gain an axis puts on an operation that grows with it: 1 at NEUTRAL, ½ at
 * 0, 1½ at 1 (decisions.ts FIELD_READING_LAW). Linear, so the field shifts an
 * operation in proportion; never 0 and never inverted, so it biases an
 * operation and never annuls it — "it modulates; it does not determine".
 */
export function rising(v: number): number {
  return 0.5 + v;
}

/** The gain on an operation that shrinks as the axis grows: 1 at NEUTRAL, 1½ at 0, ½ at 1. */
export function falling(v: number): number {
  return 1.5 - v;
}

/** A count threshold shifted by a gain: never below 1, since a threshold of 0 is no threshold. */
export function shiftedCount(base: number, gain: number): number {
  if (!Number.isFinite(base)) return base;
  return Math.max(1, Math.round(base * gain));
}

/** A share in [0, 1], or undefined when there is nothing to share (no vote). */
export function share(part: number, whole: number): number | undefined {
  return whole > 0 ? Math.min(1, Math.max(0, part / whole)) : undefined;
}

/** Cast a layer's votes into the field, if it saw anything to vote on this cycle. */
export function castVotes(
  contribute: ContributeFn,
  cast: Partial<Record<Axis, number | undefined>>,
): void {
  const v = votes(cast);
  if (Object.keys(v).length > 0) contribute(v);
}

/** A layer's votes this cycle: only the axes it saw something on. */
export function votes(
  cast: Partial<Record<Axis, number | undefined>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name of AXES) {
    const v = cast[name];
    if (v === undefined) continue;
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      throw new RangeError(`field vote on ${name} must be in [0, 1], got ${v}`);
    }
    out[name] = v;
  }
  return out;
}
