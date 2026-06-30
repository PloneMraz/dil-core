/**
 * The diversity-loss monitor (protocol §11, conformance criterion 7; stage 5).
 *
 * A conforming implementation MUST emit the diversity-loss signal when its
 * resistance-source set loses diversity. Over a sliding window of cycles, if the
 * distinct resistance sources fall below a minimum, the signal fires. This
 * catches single-source domination (a Sybil-ish external flood, §11) and
 * resistance depletion (Mode-A collapse risk). The cure lives outside the loop;
 * the protocol carries only this early signal.
 *
 * Thresholds are DECIDE@IMPL (decisions.ts), declared as tunable.
 */

import { DIVERSITY_WINDOW, MIN_DIVERSITY_SOURCES } from "./decisions.js";

export interface DiversityMonitor {
  /** Record the distinct resistance sources observed in a cycle. */
  observe(sources: readonly string[]): void;
  /** Whether diversity has been lost over the current window. */
  diversityLost(): boolean;
  /** The diversity-loss signal string, or null if diversity is intact. */
  signal(): string | null;
}

export interface DiversityOptions {
  readonly window?: number;
  readonly minSources?: number;
}

export function createDiversityMonitor(opts: DiversityOptions = {}): DiversityMonitor {
  const window = opts.window ?? DIVERSITY_WINDOW;
  const minSources = opts.minSources ?? MIN_DIVERSITY_SOURCES;
  const recent: string[][] = [];

  function diversityLost(): boolean {
    if (recent.length < window) return false; // not enough history yet
    const distinct = new Set(recent.flat());
    return distinct.size < minSources;
  }

  return {
    observe(sources) {
      recent.push([...new Set(sources)]);
      while (recent.length > window) recent.shift();
    },
    diversityLost,
    signal: () =>
      diversityLost()
        ? `diversity-loss: fewer than ${minSources} distinct resistance sources over ${window} cycles`
        : null,
  };
}
