/**
 * Answering a store query (§6.4 T3 query; §9 open layer; §12 tag F).
 *
 * T3 asks with a description of what just arrived. The store answers with every
 * datum whose open tags carry that same description — each cue key present,
 * with the same value. That is the whole index: §9 already requires a key to
 * denote the same dimension wherever it appears, "so the `[event]` log is
 * filterable", and a filter is what this is.
 *
 * The answer is a set of Signals on the store channel, ingested at T1 the next
 * cycle like any query-return (§6: "input channels: query returns"). Nothing is
 * read into any layer here, and nothing is changed in `[data]`: the provenance
 * move happens when the datum actually runs, and the driver records it then.
 */

import type { DataStore } from "../store/data-store.js";
import type { TaggedDatum } from "../store/tags.js";
import { STORE_CHANNEL, type Description } from "./layers/t3.js";
import type { Signal } from "./types.js";

/** What a query-return carries: the datum as the store held it when it answered. */
export interface StoreReturn {
  /** The datum's key in `[data]`; also the entity T4 binds the return to. */
  readonly entity: string;
  readonly payload: unknown;
  readonly fixed: TaggedDatum["fixed"];
  readonly open: TaggedDatum["open"];
  /** The cue this return answers — so T2 can match it to the query that asked. */
  readonly cue: Description;
}

/** Whether a datum's open tags carry every pair of the cue. */
export function matchesCue(datum: TaggedDatum, cue: Description): boolean {
  const keys = Object.keys(cue);
  return keys.length > 0 && keys.every((k) => datum.open[k] === cue[k]);
}

/** The Signals a store query returns, in the store's own order. */
export function answerQuery(data: DataStore, cue: Description, t: number): Signal[] {
  const out: Signal[] = [];
  for (const [id, datum] of data.entries()) {
    if (!matchesCue(datum, cue)) continue;
    const ret: StoreReturn = {
      entity: id,
      payload: datum.payload,
      fixed: datum.fixed,
      open: datum.open,
      cue: { ...cue },
    };
    out.push({ source_id: STORE_CHANNEL, raw_payload: ret, t });
  }
  return out;
}
