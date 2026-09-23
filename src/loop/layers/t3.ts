/**
 * T3 — Channel Ingestion (protocol §6.3; stage 4d).
 *
 * Ingests external and internal channels. Channel content-typing preserves the
 * distinction between information-type and physical-channel: each ingested unit
 * records BOTH which physical channel it arrived on (`channel`) and what
 * information-type it is (`infoType`). The per-channel transducer is DECIDE@IMPL
 * — pluggable, with a declared default.
 *
 * **The query (§6.4).** "T3 emits a *query*: it opens or calls a channel to
 * ingest actively, rather than only receiving what streams in." The channel it
 * calls here is the agent's own store. What T3 asks with is the arrival's own
 * description, on the open-tag dimensions the implementation declares (§9, open
 * layer; §12 tag F): a key denotes the same dimension wherever it appears, so a
 * description of what just arrived and the tags of a datum in `[data]` can be
 * matched without any new mechanism. T3 does not read the store — it emits, and
 * the return comes back through T1 next cycle like any other query-return.
 *
 * T3 asks about a description it has not asked about before. Memory is recalled
 * by the character on a cue, never poured in: the store does not flood the loop,
 * and a cue already asked about has already been answered.
 */

import type { LayerSpec, Snapshottable } from "../layer.js";
import type { Signal, InfoUnit } from "../types.js";

/** The open-tag description of an arrival: registry key → value (§9, tag F). */
export type Description = Readonly<Record<string, string>>;

/** Maps a channel's raw signal into a typed value (DECIDE@IMPL, per channel). */
export type ChannelTransducer = (signal: Signal) => {
  readonly infoType: string;
  readonly value: unknown;
  /**
   * What the arrival is, on the implementation's declared open-tag dimensions.
   * One description, or several when one arrival is about several things (a
   * status report that carries a state, a count and what may be done next is
   * about all three). Absent or empty: T3 has nothing to ask with, and does not.
   */
  readonly describe?: Description | readonly Description[];
};

/** Default transducer: pass the payload through, typed as "raw". */
const defaultTransducer: ChannelTransducer = (signal) => ({
  infoType: "raw",
  value: signal.raw_payload,
});

/** How many signals the region delivered this cycle (INV-7, up-channel). */
export const CHANNEL_ACTIVITY = "channelActivity";

/**
 * The internal channel a query to the agent's own store opens, and on which its
 * return arrives. A return is an answer, not a new cue: T3 never asks about what
 * arrived on this channel.
 */
export const STORE_CHANNEL = "store";

/** The action T3 emits to call the store (§6.4). */
export interface StoreQuery {
  readonly kind: "query";
  readonly channel: typeof STORE_CHANNEL;
  readonly cue: Description;
}

/** The query T3 emits for a cue — also what a return names as its cause (T2). */
export function storeQuery(cue: Description): StoreQuery {
  return { kind: "query", channel: STORE_CHANNEL, cue: { ...cue } };
}

export function isStoreQuery(action: unknown): action is StoreQuery {
  const a = action as Partial<StoreQuery> | null;
  return (
    typeof a === "object" &&
    a !== null &&
    a.kind === "query" &&
    a.channel === STORE_CHANNEL &&
    typeof a.cue === "object" &&
    a.cue !== null
  );
}

/** A description's stable key, so the same cue is recognised however ordered. */
function cueKey(cue: Description): string {
  return JSON.stringify(Object.entries(cue).sort(([a], [b]) => a.localeCompare(b)));
}

export interface T3Input {
  readonly signals: readonly Signal[];
}

export interface T3Output {
  readonly units: readonly InfoUnit[];
}

export function createT3(
  transducers: Readonly<Record<string, ChannelTransducer>> = {},
): LayerSpec<T3Input, T3Output> & Snapshottable {
  // Every cue T3 has asked the store about (INV-5: accrued, never reloaded).
  const asked = new Set<string>();

  return {
    index: 3,
    consumes: [1],
    snapshot: () => ({ asked: [...asked] }),
    restore(state: unknown): void {
      asked.clear();
      for (const k of (state as { asked: string[] }).asked) asked.add(k);
    },
    process(input, _field, emit, contribute): T3Output {
      // A FACT T3 can see and no other layer can: how much the region said this
      // cycle. Not a policy number — T3 does not decide what follows from it.
      contribute({ [CHANNEL_ACTIVITY]: input.signals.length });
      const units = input.signals.map((signal): InfoUnit => {
        const transduce = transducers[signal.source_id] ?? defaultTransducer;
        const { infoType, value, describe } = transduce(signal);

        if (signal.source_id !== STORE_CHANNEL && describe !== undefined) {
          const cues: readonly Description[] = Array.isArray(describe)
            ? (describe as readonly Description[])
            : [describe as Description];
          for (const cue of cues) {
            if (Object.keys(cue).length === 0) continue;
            const key = cueKey(cue);
            if (asked.has(key)) continue;
            asked.add(key);
            emit(storeQuery(cue));
          }
        }

        return {
          // content-typing keeps the info-type and the physical channel distinct
          content: { infoType, channel: signal.source_id, value },
          ref_frame: { boundLayer: 3, ref: `channel:${signal.source_id}` },
          t: signal.t,
        };
      });
      return { units };
    },
    infoUnits: (out) => out.units,
  };
}
