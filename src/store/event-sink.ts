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
 * truncate. On restart it may only append — and it CONTINUES the hash chain
 * from the existing last line, so the chain spans restarts.
 *
 * Enforcement boundary (honest scope): this gives DURABILITY (records survive
 * the process) and TAMPER-EVIDENCE at rest (each line is hash-chained,
 * hash-chain.ts; verifyJsonlSink detects any altered, removed, inserted, or
 * reordered line). It does NOT defeat a total rewrite by a party with full
 * write access — that requires anchoring the chain head outside their reach,
 * which is deployment-open — and it is NOT the §9 full-system commit/snapshot,
 * which remains deferred (store/decisions.ts COMMIT_CADENCE).
 */

import * as fs from "node:fs";
import type { EventRecord, ResistEvent, ContextAnchor } from "./resist-event.js";
import type { LayerTrace, OpenTags, Provenance } from "./tags.js";
import {
  CHAIN_GENESIS,
  chainNext,
  verifyChain,
  type ChainedEventLine,
  type ChainVerification,
} from "./hash-chain.js";

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

/** A JSONL file sink also exposes an explicit close and the current chain head. */
export interface FileEventSink extends EventSink {
  close(): void;
  /**
   * The current chain head (CHAIN_GENESIS while empty). Read-only; a deployment
   * anchors this outside its own write reach to make a total rewrite detectable.
   */
  head(): string;
}

/**
 * Create a JSONL append-only file sink. Opens the file in append mode (`a`), so
 * it can never rewrite or truncate existing content; each `write` appends one
 * hash-chained line and fsyncs it to durable storage. On a fresh process it
 * opens the same file, resumes the chain from the last existing line, and
 * appends after it. If the existing tail cannot be parsed, opening THROWS
 * rather than appending past corruption and burying the evidence.
 */
export function createJsonlFileSink(filePath: string): FileEventSink {
  // Resume the chain from the existing file, if any.
  let seq = 0;
  let prev = CHAIN_GENESIS;
  const existing = readChainedLines(filePath);
  if (existing.length > 0) {
    const last = existing[existing.length - 1]!;
    if (typeof last.hash !== "string" || typeof last.seq !== "number") {
      throw new Error(
        `event sink: cannot resume chain in ${filePath} — unparsable tail; refusing to append past corruption`,
      );
    }
    seq = last.seq + 1;
    prev = last.hash;
  }

  const fd = fs.openSync(filePath, "a"); // append-only; never truncates
  return {
    write(record: EventRecord): void {
      const line = chainNext(prev, seq, serializeEventRecord(record));
      fs.writeSync(fd, JSON.stringify(line) + "\n");
      fs.fsyncSync(fd); // durability: flush to disk before returning
      prev = line.hash;
      seq += 1;
    },
    close(): void {
      fs.closeSync(fd);
    },
    head: () => prev,
  };
}

/**
 * Read back the chained lines a JSONL sink has written. Never mutates the file.
 */
export function readChainedLines(filePath: string): ChainedEventLine[] {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ChainedEventLine);
}

/**
 * Read back the serialized records (chain envelope unwrapped), tags in fixed
 * order. Reading is a separate concern from the write-once sink.
 */
export function readJsonlSink(filePath: string): SerializedEventRecord[] {
  return readChainedLines(filePath).map((line) => line.record);
}

/**
 * Verify the whole chain in a sink file: detects any altered, removed,
 * inserted, or reordered line (relative to a trusted head — see hash-chain.ts
 * for the honest scope). Returns the head hash on success.
 */
export function verifyJsonlSink(filePath: string): ChainVerification {
  return verifyChain(readChainedLines(filePath));
}
