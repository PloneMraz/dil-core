/**
 * T3 — Channel Ingestion (protocol §6.3; stage 4d).
 *
 * Ingests external and internal channels. Channel content-typing preserves the
 * distinction between information-type and physical-channel: each ingested unit
 * records BOTH which physical channel it arrived on (`channel`) and what
 * information-type it is (`infoType`). The per-channel transducer is DECIDE@IMPL
 * — pluggable, with a declared default.
 */

import type { LayerSpec } from "../layer.js";
import type { Signal, InfoUnit } from "../types.js";

/** Maps a channel's raw signal into a typed value (DECIDE@IMPL, per channel). */
export type ChannelTransducer = (signal: Signal) => {
  readonly infoType: string;
  readonly value: unknown;
};

/** Default transducer: pass the payload through, typed as "raw". */
const defaultTransducer: ChannelTransducer = (signal) => ({
  infoType: "raw",
  value: signal.raw_payload,
});

/** How many signals the region delivered this cycle (INV-7, up-channel). */
export const CHANNEL_ACTIVITY = "channelActivity";

export interface T3Input {
  readonly signals: readonly Signal[];
}

export interface T3Output {
  readonly units: readonly InfoUnit[];
}

export function createT3(
  transducers: Readonly<Record<string, ChannelTransducer>> = {},
): LayerSpec<T3Input, T3Output> {
  return {
    index: 3,
    consumes: [1],
    process(input, _field, _emit, contribute): T3Output {
      // A FACT T3 can see and no other layer can: how much the region said this
      // cycle. Not a policy number — T3 does not decide what follows from it.
      contribute({ [CHANNEL_ACTIVITY]: input.signals.length });
      const units = input.signals.map((signal): InfoUnit => {
        const transduce = transducers[signal.source_id] ?? defaultTransducer;
        const { infoType, value } = transduce(signal);
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
