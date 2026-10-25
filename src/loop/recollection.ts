/**
 * Recollection — a law a mind may think by, over the record it reads.
 *
 * §9 makes the store the seat of experience: "The self accrues from scars." §10
 * requires a private store to carry the resistance-retrieval channel, "otherwise
 * drift is certain". The channel is the record's view (v0.3.9, `record-view.ts`):
 * an open link, handed to every predict rule every cycle. This is one law built
 * on it, not the link itself, and a rule takes it only by being it.
 *
 * Note what §10 names: retrieval of RESISTANCE, not retrieval of data. So what
 * this law takes from the log is an expectation — what the region gave, last
 * time, in this same situation — held by the datum that collided then. Nothing
 * else crosses. The expectation meets the region, and what the region does with
 * it is the region's to decide:
 *
 *     read [event] ──► an expectation ──► the region answers ──► mismatch ──► scar
 *
 * The scar it recalls is the datum the expectation is (`heldBy`, v0.3.5): used
 * again, it returns to `running` (§9 `scar → running`), and if the region
 * contradicts it, it is scarred again — the driver does both, as for any held
 * datum. Measured as a predictor, it loses to persistence (dil-arc3's LOG): the
 * record holds the region's exceptions, faithfully.
 *
 * THE LOG IS HISTORY, READ BACK AS AN OTHER (protocol v0.3.8; Plone,
 * 2026-10-25). The whole store is the agent's history, `[data]` its memory and
 * the log the record that is only appended to and read: the agent reads it, and
 * what it takes from it is held in its memory. That record is the real past of
 * what happened: a trace that can be followed and inspected as any program's
 * trace can. It asserts
 * nothing about a self that continues — §7 still forbids an implementation to
 * "claim self-continuity as an internal measurement". Reading it back is a
 * meeting with an Other in Mode-A, not the agent meeting itself: the record
 * returns, being immutable it "says no in a way the agent cannot re-interpret
 * away" (§8.4), and the agent may collide with it. It may not conclude that the
 * record was itself.
 *
/**
 * ONLY SCARS ARE RECALLABLE, and that is not a shortcut. §10 names retrieval of
 * RESISTANCE: what returns here is what collided. An activity record is trace,
 * not experience (§9), and this law does not take one.
 *
 * WHAT IT DOES NOT REACH, declared. The record was written under the same lens
 * that now reads it. A standing bias is recorded and returned and agrees with
 * itself, so recollection catches drift ACROSS time and not bias that never
 * moved. It is a genuine Mode-B channel and it is weaker than a foreign one;
 * §8.4's reflection — a third party's own view, pointed at a place in the trace
 * — is a different mechanism and is not replaced by this.
 */

import type { InfoUnit } from "./types.js";
import { persistence, type Expecting, type PredictRule, type RecordView } from "./layers/t5.js";

/** The reference frame a recalled unit is referred to (INV-4: non-null). */
export const RECOLLECTION_LAYER = 5 as const;

/** The purpose its reads of the record are recorded under. */
export const RECOLLECTION_PURPOSE = "recollection" as const;

export interface RecollectionOptions {
  /**
   * Derives the situation key an observation names (DECIDE@IMPL).
   *
   * The default keys on the entity alone, which is the weakest useful reading:
   * "the last time this entity resisted". A host that can say WHERE it is
   * supplies a sharper key, and then the recalled expectation is about this
   * situation rather than about this entity in general.
   */
  readonly key?: (unit: InfoUnit) => string;
}

/** Default situation key: every situation is the same one. */
const ENTITY_ONLY = (_unit: InfoUnit): string => "";

/**
 * What the region gave, last time, in the situation this observation names —
 * held by the datum that collided then — or null when the record, as far as the
 * view reaches, holds nothing about it.
 *
 * `observed` is read to identify WHICH situation is being asked about. Its
 * content is never used as the answer: that would be the prediction scoring
 * itself (INV-8). Each scar the view returns is a record read, recorded under
 * `recollection`.
 */
export function recall(
  record: RecordView,
  entityId: string,
  observed: InfoUnit,
  opts: RecollectionOptions = {},
): Expecting | null {
  const key = opts.key ?? ENTITY_ONLY;
  const wanted = key(observed);
  for (const { record: r } of record.scars(entityId, RECOLLECTION_PURPOSE)) {
    if (r.kind !== "scar") continue;
    // An absence scar records that nothing came back. There is no observation
    // in it to recall, and inventing one would fabricate a return the region
    // never made.
    if (r.event.received === null || r.event.received === undefined || r.datumId === undefined) continue;
    const past: InfoUnit = {
      content: r.event.received,
      ref_frame: { boundLayer: RECOLLECTION_LAYER, ref: `recollection:${entityId}` },
      t: r.event.t,
    };
    if (key(past) === wanted) return { predicted: past, heldBy: [r.datumId] };
  }
  return null;
}

/**
 * A PredictRule that reads the record first and falls back when it is silent.
 *
 * The record answers only about a situation it holds within the view's reach; a
 * situation it has never met leaves the fallback in charge, so this is never
 * worse-informed than the law it extends. With no view — a rule run outside a
 * cycle — the fallback answers.
 */
export function recollecting(fallback: PredictRule = persistence, opts: RecollectionOptions = {}): PredictRule {
  return (entityId, window, observed, contribute, ask, write, test, field, read, record) =>
    (record ? recall(record, entityId, observed, opts) : null) ??
    fallback(entityId, window, observed, contribute, ask, write, test, field, read, record);
}
