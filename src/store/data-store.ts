/**
 * The [data] store and the provenance lifecycle (protocol §9).
 *
 * `[data]` is mutable — overwritten each cycle — unlike the immutable `[event]`
 * log. It is the loop's working memory.
 *
 * Lifecycle: prior → running → scar. The store records and tags origin ONLY; the
 * tag is mechanical (presence/absence of a cycle-mark and a resistance-stamp)
 * and carries no claim of correctness. Two rules are load-bearing:
 *   - Running many cycles does NOT wash a `prior` to tested status; only
 *     collision-and-hold does. So `scar` is reachable only from `running`.
 *   - A `prior` becomes `running` by acquiring a cycle-mark (it has run).
 *
 * The four fixed tags are never overwritten as a schema: advancing provenance
 * produces a new datum value carrying the same four tags in order, with the
 * cycle-mark/provenance advanced — never stripped, reordered, or dropped.
 */

import type { TaggedDatum } from "./tags.js";
import type { LayerIndex } from "../invariants/types.js";

/**
 * Stamp a datum as it exits a layer: overwrite the floor-tag to the current
 * layer ("where is it now") and append that layer to the layer_trace ("where
 * has it been"). This is the operation every layer T1–T8 performs as a datum
 * passes; there are no pass-through layers (protocol §9). The floor-tag slot is
 * overwritten by design — the four fixed slots are never stripped or reordered,
 * but their values advance under defined rules, and the floor-tag's rule is to
 * track the current layer.
 */
export function stampLayer<T>(
  datum: TaggedDatum<T>,
  layer: LayerIndex,
): TaggedDatum<T> {
  return {
    ...datum,
    fixed: { ...datum.fixed, floorTag: layer },
    trace: [...datum.trace, layer],
  };
}

export class LifecycleError extends Error {
  constructor(detail: string) {
    super(`illegal provenance transition: ${detail}`);
    this.name = "LifecycleError";
    Object.setPrototypeOf(this, LifecycleError.prototype);
  }
}

/**
 * prior → running. The datum acquires a cycle-mark (it has run). Throws if the
 * datum is not currently `prior`.
 */
export function toRunning<T>(
  datum: TaggedDatum<T>,
  cycle: number,
): TaggedDatum<T> {
  if (datum.fixed.provenance !== "prior") {
    throw new LifecycleError(
      `to running requires provenance "prior", got "${datum.fixed.provenance}"`,
    );
  }
  return {
    ...datum,
    fixed: { ...datum.fixed, cycleMark: cycle, provenance: "running" },
  };
}

/**
 * running → scar. Reachable ONLY from `running`, and ONLY on collision-and-hold
 * (a held resistance-stamp). Throws otherwise — a `prior` cannot jump to `scar`,
 * and a running datum that never held a collision is not a scar.
 */
export function toScar<T>(
  datum: TaggedDatum<T>,
  heldResistance: boolean,
): TaggedDatum<T> {
  if (datum.fixed.provenance !== "running") {
    throw new LifecycleError(
      `to scar requires provenance "running", got "${datum.fixed.provenance}"`,
    );
  }
  if (!heldResistance) {
    throw new LifecycleError(
      "to scar requires a held collision (resistance-stamp); running alone does not produce a scar",
    );
  }
  return {
    ...datum,
    fixed: { ...datum.fixed, provenance: "scar" },
  };
}

/** The mutable [data] store: overwritten each cycle, keyed by datum id. */
export interface DataStore {
  put(id: string, datum: TaggedDatum): void;
  get(id: string): TaggedDatum | undefined;
  has(id: string): boolean;
  delete(id: string): boolean;
  /** Clear all entries — `[data]` may be wiped each cycle. */
  clear(): void;
  size(): number;
  /** Read-only enumeration of all entries, in insertion order (for inspection). */
  entries(): readonly (readonly [string, TaggedDatum])[];
}

export function createDataStore(): DataStore {
  const map = new Map<string, TaggedDatum>();
  return {
    put: (id, datum) => void map.set(id, datum),
    get: (id) => map.get(id),
    has: (id) => map.has(id),
    delete: (id) => map.delete(id),
    clear: () => map.clear(),
    size: () => map.size,
    entries: () => [...map.entries()],
  };
}
