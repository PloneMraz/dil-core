/**
 * Recollection — the store answering, as an expectation and as nothing else.
 *
 * §9 makes the store the seat of experience: "The self accrues from scars." §10
 * requires a private store to carry the resistance-retrieval channel, "otherwise
 * drift is certain". Neither clause was satisfied anywhere: scars were written
 * and never returned, and the three edges §9 defines for their return —
 * `scar → running`, `scar → simulated`, `scar → projected` — could not fire,
 * because nothing in the loop read the store at all.
 *
 * This is that channel. Note what §10 actually names: retrieval of RESISTANCE,
 * not retrieval of data. So the log's only output here is an expectation — what
 * the region gave, last time, in this same situation. Nothing else crosses. The
 * expectation then meets the region, and what the region does with it is the
 * region's to decide:
 *
 *     read [event] ──► an expectation ──► the region answers ──► mismatch ──► scar
 *
 * WHY THE LOG IS AN OTHER AND NOT A MEMORY. §7 forbids the alternative outright:
 * "Continuity is not measurable from within... An implementation MUST NOT claim
 * self-continuity as an internal measurement." An agent treating the log as *its
 * own past* would be asserting exactly that continuity. It may only treat the
 * log as something that RETURNS — and a returning record satisfies §8.4's
 * B-source rule better than most live sources do, being immutable: it "says no
 * in a way the agent cannot re-interpret away". The agent may collide with the
 * record. It may not conclude that the record was itself.
 *
 * ONLY SCARS ARE RECALLABLE, and that is not a shortcut. §9 admits activity
 * records to the log as "trace, not experience: no layer learns from it", which
 * "keeps the audit trail complete across quiet stretches without letting
 * uncontested information into the agent's memory". Recalling only collided
 * material keeps that line exactly where §9 draws it.
 *
 * WHAT IT DOES NOT REACH, declared. The record was written under the same lens
 * that now reads it. A standing bias is recorded and returned and agrees with
 * itself, so recollection catches drift ACROSS time and not bias that never
 * moved. It is a genuine Mode-B channel and it is weaker than a foreign one;
 * §8.4's reflection — a third party reading a collision into coordinates — is a
 * different mechanism and is not replaced by this.
 */

import type { InfoUnit } from "./types.js";
import type { ReadableEventLog } from "../store/event-log.js";
import { persistence, type PredictRule } from "./layers/t5.js";

/** The reference frame a recalled unit is referred to (INV-4: non-null). */
export const RECOLLECTION_LAYER = 5 as const;

/**
 * Where a recalled expectation came from — a scar, named by the datum key it
 * takes in `[data]` and the cycle it was recorded at.
 */
export interface RecalledFrom {
  readonly entityId: string;
  /** The cycle the recalled scar was recorded at; its `[data]` key is `cycle-N`. */
  readonly cycle: number;
  readonly t: number;
}

export interface Recollection {
  /**
   * What the region gave, last time, in the situation this observation names —
   * or null when the record holds nothing about it.
   *
   * `observed` is read to identify WHICH situation is being asked about. Its
   * content is never used as the answer: that would be the prediction scoring
   * itself (INV-8).
   */
  recall(entityId: string, observed: InfoUnit): InfoUnit | null;
  /**
   * The scars recalled since the last drain, for the driver to record.
   *
   * A recalled scar has returned "to the store as data in use" (§9,
   * `scar → running`), and §9 requires every such transition to be recorded in
   * `[event]` as it occurs. A layer MUST NOT write to the log, so the
   * recollection reports and the DRIVER writes — the same division the rest of
   * the loop keeps.
   */
  drain(): readonly RecalledFrom[];
}

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
  /**
   * How many of an entity's records to scan back through, newest first. A bound,
   * not a policy: the log is unbounded by §9 and a per-cycle read must not grow
   * with it.
   */
  readonly maxScan?: number;
}

/** Default situation key: every situation is the same one. */
const ENTITY_ONLY = (_unit: InfoUnit): string => "";

export const DEFAULT_MAX_SCAN = 64;

/**
 * A Recollection over an `[event]` log.
 *
 * Takes a ReadableEventLog and nothing more: the type gives it no way to write,
 * so §8.4's "Mode-B returns; it does not write" holds by construction — this
 * channel cannot append to `[event]`, reach into `[data]`, or correct the store.
 */
export function createLogRecollection(
  log: ReadableEventLog,
  opts: RecollectionOptions = {},
): Recollection {
  const key = opts.key ?? ENTITY_ONLY;
  const maxScan = opts.maxScan ?? DEFAULT_MAX_SCAN;
  let recalled: RecalledFrom[] = [];

  return {
    drain(): readonly RecalledFrom[] {
      const out = recalled;
      recalled = [];
      return out;
    },
    recall(entityId, observed): InfoUnit | null {
      const wanted = key(observed);
      const records = log.bySourceId(entityId);
      const from = Math.max(0, records.length - maxScan);

      for (let i = records.length - 1; i >= from; i--) {
        const { event } = records[i]!;
        // An absence scar records that nothing came back. There is no
        // observation in it to recall, and inventing one would fabricate a
        // return the region never made.
        if (event.received === null || event.received === undefined) continue;

        const past: InfoUnit = {
          content: event.received,
          ref_frame: { boundLayer: RECOLLECTION_LAYER, ref: `recollection:${entityId}` },
          t: event.t,
        };
        if (key(past) === wanted) {
          recalled.push({ entityId, cycle: records[i]!.anchor.cycle, t: event.t });
          return past;
        }
      }
      return null;
    },
  };
}

/**
 * A PredictRule that asks the record first and falls back when it is silent.
 *
 * The record answers only about a situation it actually holds; a situation it
 * has never met leaves the fallback in charge, so this is never worse-informed
 * than the law it extends.
 */
export function recollecting(
  recollection: Recollection,
  fallback: PredictRule = persistence,
): PredictRule {
  return (entityId, window, observed, contribute, ask) =>
    recollection.recall(entityId, observed) ??
    fallback(entityId, window, observed, contribute, ask);
}
