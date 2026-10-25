/**
 * The [event] log — the one trusted artifact (protocol §9, §13; AGENTS.md).
 *
 * `[event]` is a black box: an append-only log of read-only records. New records
 * may be appended to the end, but no record, once written, may be altered or
 * removed — by the loop, by anything, or by a third party that has compromised
 * the rest of the system. This is the single source an auditor can trust
 * unconditionally, and it doubles as the record in the agent's history and the
 * conformance trace (one artifact, two roles — no parallel trace channel).
 *
 * Enforcement boundary (honest scope): in-memory, this module deep-freezes every
 * record and exposes NO update/remove API — only append and read. That stops
 * accidental and in-process mutation. For DURABILITY (records surviving the
 * process), pass an optional EventSink: every appended record is mirrored to it
 * at append time. Tamper-evidence at rest is the sink's hash chain
 * (`event-sink.ts`), and the content-addressed commit markers that pin its head
 * are the commit store's (`runtime/commit.ts`): neither is this module's.
 */

import type { EventRecord, LogRecord } from "./resist-event.js";
import type { EventSink, JsonlSinkOptions } from "./event-sink.js";
import { createJsonlFileSink, readLogRecords, readLogRecordsBack } from "./event-sink.js";
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
 * A READ-ONLY view of the [event] log — reads and indexed lookups only, no
 * `append`. A Mode-B source and the reflection reader take THIS view, so
 * "Mode-B returns; it does not write" (§8.4) is a type-level guarantee: they can
 * read the log to form a reading, but the type gives them no way to write it.
 */
export interface ReadableEventLog {
  /** All records, oldest first, each frozen. */
  all(): readonly LogRecord[];
  /** Number of records (the commit counter reads this). */
  size(): number;
  /** Scar lookup by resistance source (activity records carry no source_id). */
  bySourceId(source_id: string): readonly EventRecord[];
  /**
   * The records before `before` (a place in the chain), newest first, at most
   * `scan` of them (v0.3.9 §9, "Reading the record"). Bounded, so a read in a
   * cycle costs what it scans, never the whole log.
   */
  back(before: number, scan: number): readonly SeqRecord[];
}

/** A record with its place in the chain: `seq`, as its line carries it. */
export interface SeqRecord {
  readonly seq: number;
  readonly record: LogRecord;
}

/**
 * The place in the chain an id names, when it names a record of the log —
 * `event:<seq>`, as a datum built from a record read names it — rather than a
 * datum; undefined otherwise (v0.3.9).
 */
export function recordSeq(id: string): number | undefined {
  const m = /^event:(\d+)$/.exec(id);
  return m ? Number(m[1]) : undefined;
}

/**
 * The append-only [event] log. Deliberately exposes only `append`, reads, and
 * indexed lookups — there is no method to alter or remove a record. Internally
 * `INDEX_KEYS` (DECIDE@IMPL tag F) drive the lookups.
 */
export interface EventLog extends ReadableEventLog {
  /** Append a record (scar or activity); it is deep-frozen and read-only forever. */
  append(record: LogRecord): void;
}

/**
 * Create an [event] log. Pass an optional `sink` to mirror every appended record
 * to durable storage (e.g. a JSONL file sink) at append time (DECIDE@IMPL tag F,
 * EVENT_DURABILITY in decisions.ts). Without a sink the log is in-memory only.
 */
export function createEventLog(sink?: EventSink): EventLog {
  const records: LogRecord[] = [];
  const bySource = new Map<string, EventRecord[]>();

  return {
    append(record: LogRecord): void {
      const frozen = deepFreeze(record);
      records.push(frozen);
      // Maintain the source_id index over scars (INDEX_KEYS, decisions.ts).
      void INDEX_KEYS;
      if (frozen.kind === "scar") {
        const key = frozen.event.source_id;
        const bucket = bySource.get(key);
        if (bucket) {
          bucket.push(frozen);
        } else {
          bySource.set(key, [frozen]);
        }
      }
      // Mirror to the durable sink, if one is wired (append-only, write-once).
      sink?.write(frozen);
    },
    all(): readonly LogRecord[] {
      return records;
    },
    size(): number {
      return records.length;
    },
    bySourceId(source_id: string): readonly EventRecord[] {
      return bySource.get(source_id) ?? [];
    },
    back(before: number, scan: number): readonly SeqRecord[] {
      const out: SeqRecord[] = [];
      for (let seq = Math.min(before, records.length) - 1; seq >= 0 && out.length < scan; seq--) {
        out.push({ seq, record: records[seq]! });
      }
      return out;
    },
  };
}

/** A durable [event] log whose source of truth is the substrate (disk). */
export interface DurableEventLog extends EventLog {
  /** The current tamper-evidence chain head (for external anchoring). */
  head(): string;
  /** Close the underlying file handle. */
  close(): void;
  /** SYNC_CADENCE "cycle": sync to disk once a cycle, on `sync()` (decisions.ts). */
  syncEachCycle(): void;
  /** Sync what was appended to disk. */
  sync(): void;
}

/**
 * Create a durable [event] log over a substrate directory (`store/event-log/`).
 *
 * The SOURCE OF TRUTH is the disk: every record is appended to the append-only,
 * hash-chained JSONL sink, and reads (`all`, `bySourceId`) come back FROM the
 * substrate. RAM holds only a monotonic counter and the chain head — never the
 * record history, so it cannot grow without bound (the "phình vô hạn" fix). An
 * auditor trusts the durable, anchored log, not a process's RAM.
 *
 * Reads deserialize the whole live log, so they are an audit-time operation (the
 * per-cycle path only `append`s and reads `size()`); a tiering deployment keeps
 * only recent segments hot and archives older ones (never deleting — §9).
 */
export function createDurableEventLog(
  dir: string,
  opts?: JsonlSinkOptions,
): DurableEventLog {
  const sink = createJsonlFileSink(dir, opts);
  // Resume the counter from whatever the substrate already holds.
  let count = readLogRecords(dir).length;

  return {
    append(record: LogRecord): void {
      sink.write(deepFreeze(record));
      count += 1;
    },
    all(): readonly LogRecord[] {
      return readLogRecords(dir);
    },
    size(): number {
      return count;
    },
    bySourceId(source_id: string): readonly EventRecord[] {
      return readLogRecords(dir).filter(
        (r): r is EventRecord => r.kind === "scar" && r.event.source_id === source_id,
      );
    },
    back(before: number, scan: number): readonly SeqRecord[] {
      return readLogRecordsBack(dir, before, scan);
    },
    head: () => sink.head(),
    close: () => sink.close(),
    syncEachCycle: () => sink.syncEachCycle(),
    sync: () => sink.sync(),
  };
}
