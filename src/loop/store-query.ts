/**
 * Answering a store query (§6.4 T3 query; §9 open layer; §12 tag F).
 *
 * T3 asks with a description of what just arrived. The store answers with every
 * datum whose open tags carry that same description — each cue key present,
 * with the same value. That is the whole index: §9 already requires a key to
 * denote the same dimension wherever it appears, "so the `[event]` log is
 * filterable", and a filter is what this is.
 *
 * One key reads the fixed layer instead: `provenance`, the position a datum
 * occupies now. "What collided" is a question about position, not about what a
 * datum is, so a cue may carry it — `{ kind: "frame", provenance: "scar" }` — and
 * no open tag may use that key, since open tags never overwrite the fixed layer.
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

/** The one cue key read from the fixed layer rather than the open layer. */
export const PROVENANCE_CUE = "provenance";

function valueFor(datum: TaggedDatum, key: string): string | undefined {
  return key === PROVENANCE_CUE ? datum.fixed.provenance : datum.open[key];
}

/** Whether a datum carries every pair of the cue: its open tags, and its provenance for that one key. */
export function matchesCue(datum: TaggedDatum, cue: Description): boolean {
  const keys = Object.keys(cue);
  return keys.length > 0 && keys.every((k) => valueFor(datum, k) === cue[k]);
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
