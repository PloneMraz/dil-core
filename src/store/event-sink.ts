/**
 * EventSink — durable, write-once mirroring of the [event] log (protocol §9).
 *
 * The in-memory [event] log is append-only with read-only records, but it dies
 * with the process. For the log to be audit-ready in the strong sense — a trace
 * a third party can read *after* the run — records must also be persisted. An
 * EventSink is that persistence: an append-only, WRITE-ONCE surface. It exposes
 * `write` and nothing else — there is, by construction, no method to update,
 * delete, or truncate a record.
 *
 * The JSONL file sink writes one immutable record per line and fsyncs each
 * append; it opens the file for append only, so it can never rewrite or
 * truncate. On restart it may only append.
 *
 * Enforcement boundary (honest scope): this gives DURABILITY (records survive
 * the process). It does NOT yet give tamper-EVIDENCE — content-addressed /
 * hash-chained commit markers remain deferred (store/decisions.ts COMMIT_CADENCE).
 * A party with write access to the file could append forged lines; detecting
 * that is the deferred work, not claimed here.
 */

import * as fs from "node:fs";
import type { EventRecord, ResistEvent, ContextAnchor } from "./resist-event.js";
import type { LayerTrace, OpenTags, Provenance } from "./tags.js";

/**
 * A record serialized WITH its full tag set, in the fixed order:
 * timestamp, cycle-mark, provenance, floor-tag, open tags (incl. domain),
 * layer_trace — then the payload, the ResistEvent, and the context anchor.
 */
export interface SerializedEventRecord {
  readonly timestamp: number;
  readonly cycleMark: number | null;
  readonly provenance: Provenance;
  readonly floorTag: number;
  readonly open: OpenTags;
  readonly layer_trace: LayerTrace;
  readonly payload: unknown;
  readonly event: ResistEvent;
  readonly anchor: ContextAnchor;
}

/** Project an EventRecord into its serialized form, tags in fixed order. */
export function serializeEventRecord(rec: EventRecord): SerializedEventRecord {
  const f = rec.scar.fixed;
  return {
    timestamp: f.timestamp,
    cycleMark: f.cycleMark,
    provenance: f.provenance,
    floorTag: f.floorTag,
    open: rec.scar.open,
    layer_trace: rec.scar.trace,
    payload: rec.scar.payload,
    event: rec.event,
    anchor: rec.anchor,
  };
}

/**
 * The append-only, write-once sink surface. Intentionally the ONLY method is
 * `write` — no update, delete, or truncate exists to be called.
 */
export interface EventSink {
  write(record: EventRecord): void;
}

/** A JSONL file sink also exposes an explicit close for its file descriptor. */
export interface FileEventSink extends EventSink {
  close(): void;
}

/**
 * Create a JSONL append-only file sink. Opens the file in append mode (`a`), so
 * it can never rewrite or truncate existing content; each `write` appends one
 * line and fsyncs it to durable storage. On a fresh process it opens the same
 * file and appends after the existing records.
 */
export function createJsonlFileSink(filePath: string): FileEventSink {
  const fd = fs.openSync(filePath, "a"); // append-only; never truncates
  return {
    write(record: EventRecord): void {
      fs.writeSync(fd, JSON.stringify(serializeEventRecord(record)) + "\n");
      fs.fsyncSync(fd); // durability: flush to disk before returning
    },
    close(): void {
      fs.closeSync(fd);
    },
  };
}

/**
 * Read back the serialized records a JSONL sink has written (for audit and for
 * verifying survival across a reopen). Reading is a separate concern from the
 * write-once sink; it never mutates the file.
 */
export function readJsonlSink(filePath: string): SerializedEventRecord[] {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as SerializedEventRecord);
}
