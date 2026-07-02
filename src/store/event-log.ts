/**
 * The [event] log — the one trusted artifact (protocol §9, §13; AGENTS.md).
 *
 * `[event]` is a black box: an append-only log of read-only records. New records
 * may be appended to the end, but no record, once written, may be altered or
 * removed — by the loop, by anything, or by a third party that has compromised
 * the rest of the system. This is the single source an auditor can trust
 * unconditionally, and it doubles as the agent's memory and the conformance
 * trace (one artifact, two roles — no parallel trace channel).
 *
 * Enforcement boundary (honest scope): in-memory, this module deep-freezes every
 * record and exposes NO update/remove API — only append and read. That stops
 * accidental and in-process mutation. For DURABILITY (records surviving the
 * process), pass an optional EventSink: every appended record is mirrored to it
 * at append time. The stronger, tamper-EVIDENT guarantee against a compromised
 * host (content-addressed commit markers) remains deferred (decisions.ts
 * COMMIT_CADENCE) and is NOT provided by the sink.
 */

import type { EventRecord } from "./resist-event.js";
import type { EventSink } from "./event-sink.js";
import { INDEX_KEYS } from "./decisions.js";

/** Recursively freeze an object so no nested field can be altered. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * The append-only [event] log. Deliberately exposes only `append`, reads, and
 * indexed lookups — there is no method to alter or remove a record. Internally
 * `INDEX_KEYS` (DECIDE@IMPL tag F) drive the lookups.
 */
export interface EventLog {
  /** Append a record; it is deep-frozen and becomes read-only forever. */
  append(record: EventRecord): void;
  /** All records, oldest first, each frozen. */
  all(): readonly EventRecord[];
  /** Number of records (the commit counter reads this). */
  size(): number;
  /** Lookup by an indexed key (source_id or provenance). */
  bySourceId(source_id: string): readonly EventRecord[];
}

/**
 * Create an [event] log. Pass an optional `sink` to mirror every appended record
 * to durable storage (e.g. a JSONL file sink) at append time (DECIDE@IMPL tag F,
 * EVENT_DURABILITY in decisions.ts). Without a sink the log is in-memory only.
 */
export function createEventLog(sink?: EventSink): EventLog {
  const records: EventRecord[] = [];
  const bySource = new Map<string, EventRecord[]>();

  return {
    append(record: EventRecord): void {
      const frozen = deepFreeze(record);
      records.push(frozen);
      // Maintain the source_id index (INDEX_KEYS, decisions.ts).
      void INDEX_KEYS;
      const key = frozen.event.source_id;
      const bucket = bySource.get(key);
      if (bucket) {
        bucket.push(frozen);
      } else {
        bySource.set(key, [frozen]);
      }
      // Mirror to the durable sink, if one is wired (append-only, write-once).
      sink?.write(frozen);
    },
    all(): readonly EventRecord[] {
      return records;
    },
    size(): number {
      return records.length;
    },
    bySourceId(source_id: string): readonly EventRecord[] {
      return bySource.get(source_id) ?? [];
    },
  };
}
