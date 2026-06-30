/**
 * The meaning-channel (protocol §6.2, INV-3; stage 4c).
 *
 * The up-channel: a layer makes its output available and each higher layer reads
 * what falls within its dependency set. "The mechanism is consumption, not
 * dispatch." Reads are guarded by INV-3 — a consumer may read only layers ≤ its
 * own index; reading a higher layer halts the loop.
 *
 * This is deliberately separate from the modulatory field (the down-channel,
 * INV-7): the two channels are never collapsed into one.
 */

import { assertMeaningChannelOrder } from "../invariants/guards.js";
import type { LayerIndex } from "../invariants/types.js";

export interface MeaningChannel {
  /** A layer publishes its output, making it available to higher layers. */
  publish(layer: LayerIndex, output: unknown): void;
  /** A consumer reads a lower layer's output; halts (INV-3) if `from` > `consumer`. */
  read(consumer: LayerIndex, from: LayerIndex): unknown;
  /** Whether a layer has published this cycle. */
  has(layer: LayerIndex): boolean;
  /** Clear all published outputs (between cycles). */
  clear(): void;
}

export function createMeaningChannel(): MeaningChannel {
  const outputs = new Map<LayerIndex, unknown>();
  return {
    publish: (layer, output) => void outputs.set(layer, output),
    read(consumer, from) {
      assertMeaningChannelOrder(consumer, from); // INV-3
      return outputs.get(from);
    },
    has: (layer) => outputs.has(layer),
    clear: () => outputs.clear(),
  };
}
