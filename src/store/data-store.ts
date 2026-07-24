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

import type { TaggedDatum, Provenance } from "./tags.js";
import type { LayerIndex } from "../invariants/types.js";

/**
 * Stamp a datum as it exits a layer: overwrite the floor-tag to the current layer
 * ("where is it now"). This is the operation every layer T1–T8 performs as a
 * datum passes; there are no pass-through layers (protocol §9). The floor-tag slot
 * is overwritten by design — the four fixed slots are never stripped or reordered,
 * but their values advance under defined rules, and the floor-tag's rule is to
 * track the current layer. The *path* (which layers it has exited) is NOT kept
 * here; it is recorded as a `layer-exit` line in the `[event]` log as it occurs
 * (§9), and read from there.
 */
export function stampLayer<T>(
  datum: TaggedDatum<T>,
  layer: LayerIndex,
): TaggedDatum<T> {
  return {
    ...datum,
    fixed: { ...datum.fixed, floorTag: layer },
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
 * The provenance state graph (§9): the legal moves. `prior` is a one-way entry
 * (no edge returns to it); `running`, `simulated`, `projected`, `scar` circulate
 * with no terminal state — a datum is never a conclusion at rest. The forward
 * states (`simulated`/`projected`) are only *visited* once forward-building lands
 * (Bước 6); the graph is the law from here on, and every provenance move — at
 * runtime and in the `[event]` trace — is checked against it.
 */
export const PROVENANCE_EDGES: readonly (readonly [Provenance, Provenance])[] = [
  ["prior", "running"], // host data admitted and run
  ["running", "simulated"], // taken up into building a situation
  ["simulated", "projected"], // a situation yields the outcome cast from it
  ["simulated", "running"], // built, but no emission followed; back to use
  ["projected", "simulated"], // the cast outcome does not fit; build again
  ["projected", "scar"], // the emission was made, the region returned, it held
  ["running", "scar"], // collided with directly, without a prior cast
  ["projected", "running"], // an outcome that produced no scar; back to use
  ["scar", "running"], // a scar returns to the store as data in use
  ["scar", "projected"], // a scar enriches an outcome already cast
  ["scar", "simulated"], // a scar re-enters the building of a situation
];

const EDGE_SET = new Set(PROVENANCE_EDGES.map(([f, t]) => `${f}->${t}`));

/** Whether a provenance move is a legal edge of the §9 graph. */
export function isProvenanceEdge(from: Provenance, to: Provenance): boolean {
  return EDGE_SET.has(`${from}->${to}`);
}

/** Assert a provenance move is a legal edge; throw LifecycleError otherwise. */
export function assertProvenanceEdge(from: Provenance, to: Provenance): void {
  if (!isProvenanceEdge(from, to)) {
    throw new LifecycleError(`${from} → ${to} is not an edge of the §9 provenance graph`);
  }
}

/**
 * → running. A legal move to `running` (from `prior` on first run, or a re-entry
 * from `simulated`/`projected`/`scar` once circulation lands, Bước 6). The
 * cycle-mark is set once, when the datum first runs (§9): null → cycle; a datum
 * that has already run keeps its mark on re-entry.
 */
export function toRunning<T>(
  datum: TaggedDatum<T>,
  cycle: number,
): TaggedDatum<T> {
  assertProvenanceEdge(datum.fixed.provenance, "running");
  return {
    ...datum,
    fixed: {
      ...datum.fixed,
      cycleMark: datum.fixed.cycleMark ?? cycle,
      provenance: "running",
    },
  };
}

/**
 * → scar. Reachable from `running` or `projected` (both valid edges), and ONLY on
 * collision-and-hold (a held resistance-stamp). Throws otherwise — a `prior`
 * cannot jump to `scar`, and a datum that never held a collision is not a scar.
 */
export function toScar<T>(
  datum: TaggedDatum<T>,
  heldResistance: boolean,
): TaggedDatum<T> {
  assertProvenanceEdge(datum.fixed.provenance, "scar");
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
