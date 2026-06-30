/**
 * HostSource — the requisition boundary (CONTEXT.md §5; stage 5).
 *
 * The host declares where its IO is; the daemon threads its mechanism through.
 * A HostSource supplies each cycle's input (the region's returns) and accepts
 * the agent's response. The agent acts through `deliver`; DIL is the condition,
 * not the actor — `deliver` is the host's channel, not DIL speaking to the world.
 *
 * For the minimal host a scripted source stands in; a real deployment supplies a
 * live source (the Mode-B Other — decisions.ts tag D).
 */

import type { Emission } from "../loop/layers/t2.js";
import type { HostCycleInput } from "../loop/cycle.js";

export interface HostSource {
  /** The next cycle's input, or null when none is available right now. */
  next(): HostCycleInput | null;
  /** Deliver the agent's response back to the region (the agent acts). */
  deliver(response: Emission): void;
}

/**
 * A finite scripted source over a list of inputs — for the minimal host and
 * tests. Records delivered responses so a test can inspect what the agent acted.
 */
export function scriptedSource(inputs: readonly HostCycleInput[]): HostSource & {
  readonly delivered: readonly Emission[];
} {
  let i = 0;
  const delivered: Emission[] = [];
  return {
    delivered,
    next: () => (i < inputs.length ? inputs[i++]! : null),
    deliver: (response) => void delivered.push(response),
  };
}
