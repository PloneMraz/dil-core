/**
 * The absorption measure (protocol §8.3) — is the agent's resistance a REAL brake,
 * or only deceleration?
 *
 * §8.3 ranks anchors: a fixed/memorizable source reaches only content-degradation
 * ("a fixed test is memorizable, so a systematic lens-bias passes through"), while
 * a live Mode-B "can always deliver a collision NEW IN KIND". "New in kind" is not
 * a taxonomy of mismatches — it is NOVELTY: resistance the agent cannot re-author
 * away. The trace-measurable proxy is ABSORPTION: for a source seen many times
 * (high `recurrence`), does it still produce prediction error (`delta` > 0 → not
 * absorbed → real brake), or has `delta` gone to 0 (memorized → deceleration only)?
 *
 * This reads the resistance readings a run already records — `expectation` lines
 * (value-mismatch sources) and `resistance-reading` lines (absence sources) —
 * grouped by the resisting subject, and reports per source whether it is still
 * resisting or has been absorbed. The signal fires when EVERY sufficiently-probed
 * source has been absorbed: the agent has memorized all its resistance, so nothing
 * delivers a collision new in kind — a deceleration-only regime (§8.3). It is an
 * OBSERVABILITY signal, not a §13 conformance criterion (§13 mandates source
 * diversity, §13.7, not absorption); a third party can recompute it from the log.
 */

import type { LogRecord } from "../store/resist-event.js";
import { SUFFICIENT_RECURRENCE } from "../loop/decisions.js";

/** One source's absorption state, read from its high-recurrence readings. */
export type SourceAbsorption = "resisting" | "absorbed" | "insufficient";

export interface AbsorptionReport {
  /** Per resisting subject: is it still resisting, absorbed (memorized), or under-probed? */
  readonly perSource: ReadonlyMap<string, SourceAbsorption>;
  /**
   * The absorption-loss signal, or null. Fires when at least one source is
   * sufficiently probed and EVERY sufficiently-probed source has been absorbed —
   * no collision new in kind remains, a deceleration-only regime (§8.3).
   */
  readonly signal: string | null;
}

interface Reading {
  readonly recurrence: number;
  readonly delta: number;
}

/**
 * Measure absorption from the trace. A source is `absorbed` if, once probed at
 * least `recurrenceThreshold` times, its prediction error is always 0 (memorized);
 * `resisting` if it still errs at that exposure (new in kind still arrives);
 * `insufficient` if never probed that many times.
 */
export function measureAbsorption(
  records: readonly LogRecord[],
  recurrenceThreshold: number = SUFFICIENT_RECURRENCE,
): AbsorptionReport {
  // Group readings by the resisting SUBJECT (entity): a value-mismatch reading
  // (expectation line) and an absence reading (resistance-reading line) about the
  // same entity are the same source resisting by different means.
  const byEntity = new Map<string, Reading[]>();
  const add = (entity: string, recurrence: number, delta: number): void => {
    const s = byEntity.get(entity) ?? [];
    s.push({ recurrence, delta });
    byEntity.set(entity, s);
  };
  for (const r of records) {
    if (r.kind !== "activity") continue;
    if (r.activityKind === "expectation") add(r.entity, r.recurrence, r.delta);
    else if (r.activityKind === "resistance-reading") add(r.entity, r.recurrence, r.delta);
  }

  const perSource = new Map<string, SourceAbsorption>();
  for (const [entity, readings] of byEntity) {
    const probed = readings.filter((x) => x.recurrence >= recurrenceThreshold);
    if (probed.length === 0) {
      perSource.set(entity, "insufficient");
    } else {
      // Still a real brake if it errs at high exposure; absorbed if never does.
      perSource.set(entity, probed.some((x) => x.delta > 0) ? "resisting" : "absorbed");
    }
  }

  const qualified = [...perSource.values()].filter((v) => v !== "insufficient");
  const allAbsorbed = qualified.length > 0 && qualified.every((v) => v === "absorbed");
  const signal = allAbsorbed
    ? `absorption: every sufficiently-probed resistance source (≥${recurrenceThreshold} exposures) has been memorized (prediction error → 0); no collision new in kind — deceleration only, not a real brake (§8.3)`
    : null;

  return { perSource, signal };
}
