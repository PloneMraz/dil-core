/**
 * Substrate & DIL-CLAIM — DIL imposes its store law on the host's physical
 * memory (CONTEXT.md §1, §5; the sovereign principle).
 *
 * The host supplies only a *raw durable substrate* (a directory/partition on its
 * native storage). DIL does NOT conform to any store abstraction the host might
 * carry; it *requisitions* the raw substrate and imposes its ENTIRE law on it —
 * the layout, the tag schema, the tagging-gate, the append-only [event] log, the
 * provenance lifecycle, the commit DAG. "The granary still stores, but stores by
 * a new method." (CONTEXT §1.)
 *
 * This module fixes the two lowest pieces of that imposition:
 *   - the canonical on-substrate LAYOUT (store/{memory,event-log,commits}); and
 *   - the DIL-CLAIM: a marker DIL writes into the substrate declaring that this
 *     space is now ruled by DIL's law, at a stated version. On resume, a claim
 *     that is absent is written; a claim that is present but foreign/incompatible
 *     is refused — DIL owns the format, so it will not run a store it did not
 *     stamp, or one stamped under a different law.
 *
 * The physical operations are behind a small injectable `Substrate` seam so a
 * non-filesystem host (a partition, an object store) can back it differently; the
 * default is the local filesystem (node:fs), the minimal host's physical memory.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

/**
 * The law DIL stamps onto a substrate. A resume whose stored claim does not match
 * these versions is refused (the substrate is not this DIL's, or is under a
 * different law). Bump a version only on a real, intended change to that facet.
 */
export const DIL_CLAIM = {
  /** The protocol version whose law governs this store. */
  protocol: "0.3.2",
  /** The fixed-tag + open-tag schema version (store/tags.ts). */
  tagSchema: 1,
  /** The on-substrate layout version (the three store kinds below). */
  layout: 1,
} as const;

export type DilClaim = typeof DIL_CLAIM;

/** The canonical on-substrate layout DIL imposes under a root. */
export interface StoreLayout {
  readonly root: string;
  /** `[data]` — mutable present (the SQLite store, later sub-step). */
  readonly memory: string;
  /** `[event]` — append-only, hash-chained JSONL segments. */
  readonly eventLog: string;
  /** Snapshot DAG — content-addressed commit markers. */
  readonly commits: string;
  /** The DIL-CLAIM marker file. */
  readonly claimFile: string;
}

/**
 * The physical operations DIL needs of a substrate. Default: the local
 * filesystem (`fsSubstrate`). A different host may inject its own backing.
 */
export interface Substrate {
  join(...parts: string[]): string;
  mkdirp(dir: string): void;
  exists(path: string): boolean;
  readText(path: string): string;
  writeText(path: string, text: string): void;
}

/** The default filesystem substrate (node:fs) — the minimal host's disk. */
export function fsSubstrate(): Substrate {
  return {
    join: (...parts) => nodePath.join(...parts),
    mkdirp: (dir) => void fs.mkdirSync(dir, { recursive: true }),
    exists: (path) => fs.existsSync(path),
    readText: (path) => fs.readFileSync(path, "utf8"),
    writeText: (path, text) => fs.writeFileSync(path, text),
  };
}

export class SubstrateClaimError extends Error {
  constructor(detail: string) {
    super(`DIL cannot claim the substrate: ${detail}`);
    this.name = "SubstrateClaimError";
    Object.setPrototypeOf(this, SubstrateClaimError.prototype);
  }
}

/** Resolve the canonical layout paths under a root (no I/O). */
export function layoutFor(root: string, sub: Substrate = fsSubstrate()): StoreLayout {
  return {
    root,
    memory: sub.join(root, "store", "memory"),
    eventLog: sub.join(root, "store", "event-log"),
    commits: sub.join(root, "store", "commits"),
    claimFile: sub.join(root, "store", "DIL-CLAIM.json"),
  };
}

/**
 * Claim the substrate and impose DIL's layout on it. Idempotent:
 *   - creates the three store directories if absent;
 *   - fresh substrate → writes the DIL-CLAIM marker;
 *   - already-claimed substrate → verifies the stored claim matches DIL_CLAIM;
 *     a foreign or incompatible claim throws (DIL will not run a store it did not
 *     stamp, or one stamped under a different law).
 *
 * Returns the resolved layout the rest of the store binds onto. This is the
 * concrete act of "the king sits down" — run once at startup, after the gate.
 */
export function claimSubstrate(root: string, sub: Substrate = fsSubstrate()): StoreLayout {
  const layout = layoutFor(root, sub);
  sub.mkdirp(layout.memory);
  sub.mkdirp(layout.eventLog);
  sub.mkdirp(layout.commits);

  if (sub.exists(layout.claimFile)) {
    let stored: Partial<DilClaim> & Record<string, unknown>;
    try {
      stored = JSON.parse(sub.readText(layout.claimFile));
    } catch {
      throw new SubstrateClaimError(
        `existing ${layout.claimFile} is not readable JSON; refusing to run a store whose claim is corrupt`,
      );
    }
    for (const key of ["protocol", "tagSchema", "layout"] as const) {
      if (stored[key] !== DIL_CLAIM[key]) {
        throw new SubstrateClaimError(
          `substrate at ${root} carries a foreign/incompatible claim (${key}=${String(stored[key])}, expected ${String(DIL_CLAIM[key])}); DIL will not rule a store stamped under a different law`,
        );
      }
    }
  } else {
    sub.writeText(
      layout.claimFile,
      JSON.stringify({ ...DIL_CLAIM, claimedAt: Date.now() }, null, 2) + "\n",
    );
  }

  return layout;
}
