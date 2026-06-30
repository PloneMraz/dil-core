/**
 * The loop topology (protocol §6.2, INV-1; stage 4c).
 *
 * The canonical loop is six links / eight layers closing into a cycle: T1→T2→…
 * →T8 and T8 back to T1. INV-1 requires every layer output to have a path back
 * to some layer's input — no dead branches, no terminal sink. `T8 closes back
 * into the loop, not into a sink.`
 */

import { assertClosedLoop } from "../invariants/guards.js";
import type { LoopEdge } from "../invariants/types.js";

/** The canonical T1→T8→T1 closed-loop edge set. */
export function canonicalLoopTopology(): LoopEdge[] {
  return [
    { from: 1, to: 2 },
    { from: 2, to: 3 },
    { from: 3, to: 4 },
    { from: 4, to: 5 },
    { from: 5, to: 6 },
    { from: 6, to: 7 },
    { from: 7, to: 8 },
    { from: 8, to: 1 }, // closes the loop (INV-1) — not a sink
  ];
}

/** INV-1: validate the topology closes; halts on any dead branch / sink. */
export function validateLoopTopology(edges: readonly LoopEdge[]): void {
  assertClosedLoop(edges);
}
