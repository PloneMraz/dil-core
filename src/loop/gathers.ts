/**
 * Consumption-side input assembly for multi-stream flow (protocol §6; cycle-1+).
 *
 * "The mechanism is consumption, not dispatch: a layer makes its output
 * available, and each higher layer reads what falls within its dependency
 * set." Each gather builds one layer's input by READING the meaning-channel —
 * every read passes the INV-3 guard (a consumer may read only layers ≤ its own
 * index) — so the driver never hands an output to a consumer. Fan-out is real:
 * T5's single published output is read by both T6 and T7, and T6 reads T2's
 * output itself (its declared dependency) instead of a driver-smuggled digest.
 *
 * T1 and T3 ingest the HOST's input (signals) — external ingest, not a channel
 * read; T2 additionally takes the previous cycle's emission (the feedback of
 * INV-1) and the observed changes.
 */

import type { MeaningChannel } from "./meaning-channel.js";
import type { LayerIndex, ActivityEnvironment } from "./types.js";
import type { HostCycleInput } from "./cycle.js";
import type { Emission, T2Input, T2Output } from "./layers/t2.js";
import type { T3Input, T3Output } from "./layers/t3.js";
import type { T4Input, T4Output } from "./layers/t4.js";
import type { T5Input, T5Output } from "./layers/t5.js";
import type { T6Input, T6Output } from "./layers/t6.js";
import type { T7Input } from "./layers/t7.js";
import type { T8Input } from "./layers/t8.js";

/** A declared dependency was consumed before its producer published. */
export class MultiStreamError extends Error {
  constructor(detail: string) {
    super(`multi-stream: ${detail}`);
    this.name = "MultiStreamError";
    Object.setPrototypeOf(this, MultiStreamError.prototype);
  }
}

/** Read a dependency that MUST have been published (INV-3 guarded by the channel). */
function mustRead<T>(ch: MeaningChannel, consumer: LayerIndex, from: LayerIndex): T {
  const out = ch.read(consumer, from);
  if (out === undefined) {
    throw new MultiStreamError(
      `layer T${consumer} consumed T${from}, but T${from} has published nothing this cycle`,
    );
  }
  return out as T;
}

export function gatherT2(
  ch: MeaningChannel,
  host: HostCycleInput,
  emitted: Emission,
): T2Input {
  return {
    env: mustRead<ActivityEnvironment>(ch, 2, 1),
    emitted,
    changes: host.changes,
  };
}

export function gatherT3(host: HostCycleInput): T3Input {
  return { signals: host.signals };
}

export function gatherT4(ch: MeaningChannel): T4Input {
  return { units: mustRead<T3Output>(ch, 4, 3).units };
}

export function gatherT5(ch: MeaningChannel): T5Input {
  return { bound: mustRead<T4Output>(ch, 5, 4).bound };
}

export function gatherT6(ch: MeaningChannel): T6Input {
  const t2 = mustRead<T2Output>(ch, 6, 2);
  const t5 = mustRead<T5Output>(ch, 6, 5);
  return {
    results: t5.results,
    envPushed: new Set(
      t2.tagged.filter((t) => t.agency === "ENV_PUSHED").map((t) => t.change.id),
    ),
  };
}

export function gatherT7(ch: MeaningChannel): T7Input {
  const t5 = mustRead<T5Output>(ch, 7, 5);
  return {
    expectations: t5.results.map((r) => ({
      entity_id: r.entity_id,
      predicted: r.expectation.predicted,
    })),
    observed: new Set(t5.results.map((r) => r.entity_id)),
  };
}

export function gatherT8(ch: MeaningChannel, host: HostCycleInput): T8Input {
  return {
    others: mustRead<T6Output>(ch, 8, 6).others,
    interactions: host.interactions,
  };
}
