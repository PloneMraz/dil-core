/**
 * Reflection — a third party's view, pointed at a place in the agent's trace
 * (protocol §8.4; DECIDE@IMPL tag E).
 *
 * The agent is blind to its own time-derivative (§7): it cannot self-reflect on
 * call, and no self-reflection faculty exists here. Reflection is a THIRD
 * PARTY's act: the reader, from its own lens, holds that the agent drifted and
 * says where — "you drifted at this point" — and the reading returns through a
 * declared T3 channel; the agency-gate classifies it ENV_PUSHED, since the
 * agent never emitted it.
 *
 * WHAT A READING IS, AND IS NOT. It is the reader's view, carrying no claim of
 * being right (§9): a place in the agent's trace and what the reader makes of
 * it. It is NOT the agent's own recorded collision handed back. A collision the
 * agent recorded is one it already authored — a source relaying it is compliant
 * and re-authorable (§8.3, §8.4) — and the drift a reader is for is the kind the
 * agent does not see, where every internal measure reports sufficiency (§8.2).
 * So the place a reading points at need not hold a scar at all. When the reading
 * collides, the mismatch is between the agent and the reader.
 *
 * This module supplies the MECHANISM only:
 *   - traceCycles — the cycles the agent's trace recorded, the places a reader
 *     can point at (read-only; carries no judgment);
 *   - formReading — anchor a reading to one of them. It refuses a cycle the
 *     trace never recorded: a reader cannot point at a place that is not there;
 *   - reflectionSignal / reflectionTransducer — the T3 ingestion convention.
 *
 * WHO the reader is — a user, another agent, a critic service, a piece of code
 * judging the agent's behaviour — and what its lens is, stay deployment-open,
 * like tag D.
 */

import type { ReadableEventLog } from "../store/event-log.js";
import type { Signal } from "../loop/types.js";
import type { ChannelTransducer } from "../loop/layers/t3.js";

export class ReflectionError extends Error {
  constructor(detail: string) {
    super(`reflection: ${detail}`);
    this.name = "ReflectionError";
    Object.setPrototypeOf(this, ReflectionError.prototype);
  }
}

/** A place in the agent's trace: one recorded cycle, addressed by its seal. */
export interface TraceCoordinate {
  /** The cycle. */
  readonly cycle: number;
  /** Position of the cycle's seal in the log (append order) — a stable address. */
  readonly index: number;
  /** When the cycle began. */
  readonly t: number;
}

/**
 * The cycles the agent's trace recorded, oldest first: the places a reader can
 * point at. Read-only; carries no judgment.
 */
export function traceCycles(log: ReadableEventLog): TraceCoordinate[] {
  return log.all().flatMap((rec, index) =>
    rec.kind === "activity" && rec.activityKind === "cycle-seal"
      ? [{ cycle: rec.activity.cycle, index, t: rec.activity.t }]
      : [],
  );
}

/** A third party's view of the agent, pointed at a place in its trace. */
export interface ReflectionReading {
  readonly about: TraceCoordinate;
  /** The reader's view — where or why it holds the agent drifted. No verdict. */
  readonly reading: unknown;
  /** The reader — an Other — who holds that view. */
  readonly reader_id: string;
}

/**
 * Point a reading at `cycle` of the agent's trace. Throws if the trace recorded
 * no such cycle: a reader cannot point at a place that is not there.
 */
export function formReading(
  log: ReadableEventLog,
  cycle: number,
  reader_id: string,
  reading: unknown,
): ReflectionReading {
  const about = traceCycles(log).find((c) => c.cycle === cycle);
  if (!about) {
    throw new ReflectionError(
      `the trace recorded no cycle ${cycle}; a reading must point at a place in the agent's trace`,
    );
  }
  return { about, reading, reader_id };
}

/**
 * Wrap a reading as a Signal for the declared reflection channel, so it enters
 * through T3 like any external input (no side door). The payload carries the
 * reader as the entity, so T4 binds the reading to the reader-as-Other.
 */
export function reflectionSignal(
  reading: ReflectionReading,
  channel_id: string,
  t: number,
): Signal {
  return {
    source_id: channel_id,
    raw_payload: { entity: reading.reader_id, value: reading },
    t,
  };
}

/** T3 transducer for the reflection channel: types the content "reflection". */
export const reflectionTransducer: ChannelTransducer = (signal) => ({
  infoType: "reflection",
  value: signal.raw_payload,
});
