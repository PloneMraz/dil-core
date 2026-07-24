/**
 * Reflection — the read-collision-into-coordinates mechanism (protocol §8.4;
 * DECIDE@IMPL tag E).
 *
 * The agent is blind to its own time-derivative (§7): it cannot self-reflect on
 * call, and no self-reflection faculty exists here. Reflection is a THIRD
 * PARTY's act: the reader looks at the agent's [event] log — the one trace a
 * third party already reads (§13) — reads a recorded collision into coordinates
 * ("you drifted at this point"), and returns the reading through a declared T3
 * channel; the agency-gate classifies it ENV_PUSHED, since the agent never
 * emitted it.
 *
 * This module supplies the MECHANISM only:
 *   - collisionCoordinates — mechanical extraction of scar coordinates a reader
 *     can address (the judgment stays the reader's, like the store inspector);
 *   - formReading — build a reading that MUST reference a real recorded
 *     collision (a reflection cannot be fabricated about a collision that never
 *     happened);
 *   - reflectionSignal / reflectionTransducer — the T3 ingestion convention.
 *
 * WHO the reader is (a user, another agent, a critic service — which may itself
 * consult external data such as the web) stays deployment-open, like tag D.
 */

import type { ReadableEventLog } from "../store/event-log.js";
import type { MismatchKind } from "../store/resist-event.js";
import type { Signal } from "../loop/types.js";
import type { ChannelTransducer } from "../loop/layers/t3.js";

export class ReflectionError extends Error {
  constructor(detail: string) {
    super(`reflection: ${detail}`);
    this.name = "ReflectionError";
    Object.setPrototypeOf(this, ReflectionError.prototype);
  }
}

/** The address of one recorded collision in the [event] log. */
export interface CollisionCoordinate {
  /** Position of the record in the log (append order). */
  readonly index: number;
  /** The cycle anchored with the record. */
  readonly cycle: number;
  readonly source_id: string;
  readonly mismatch_kind: MismatchKind;
  readonly t: number;
}

/**
 * Mechanically extract the coordinates of every recorded collision, for a
 * reader to browse and address. Read-only; carries no judgment.
 */
export function collisionCoordinates(log: ReadableEventLog): CollisionCoordinate[] {
  // Coordinates address SCARS (collisions); the index stays the record's
  // absolute position in the log, so a coordinate is a stable address.
  return log.all().flatMap((rec, index) =>
    rec.kind === "scar"
      ? [{
          index,
          cycle: rec.anchor.cycle,
          source_id: rec.event.source_id,
          mismatch_kind: rec.event.mismatch_kind,
          t: rec.event.t,
        }]
      : [],
  );
}

/** A third party's reading of one collision, anchored to its coordinate. */
export interface ReflectionReading {
  readonly about: CollisionCoordinate;
  /** The reader's account of where/why the agent drifted. */
  readonly reading: unknown;
  /** The reader — an Other in the region — who authored the reading. */
  readonly reader_id: string;
}

/**
 * Form a reading about the [event] record at `index`. Throws if no such record
 * exists: a reflection MUST reference a real recorded collision.
 */
export function formReading(
  log: ReadableEventLog,
  index: number,
  reader_id: string,
  reading: unknown,
): ReflectionReading {
  const rec = log.all()[index];
  if (!rec || rec.kind !== "scar") {
    throw new ReflectionError(
      `no collision record at index ${index}; a reading must reference a real recorded collision (not an activity record)`,
    );
  }
  return {
    about: {
      index,
      cycle: rec.anchor.cycle,
      source_id: rec.event.source_id,
      mismatch_kind: rec.event.mismatch_kind,
      t: rec.event.t,
    },
    reading,
    reader_id,
  };
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
