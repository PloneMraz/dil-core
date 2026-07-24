/**
 * EventSink — durable, write-once mirroring of the [event] log (protocol §9).
 *
 * The in-memory [event] log is append-only with read-only records, but it dies
 * with the process. An EventSink is the persistence: an append-only, WRITE-ONCE
 * surface — `write` and nothing else; no update, delete, or truncate exists.
 *
 * The JSONL sink writes into a DIRECTORY of daily segments:
 *   event-log-YYYYMMDD.jsonl, overflowing to -002, -003… when a segment would
 *   exceed MAX_SEGMENT_BYTES (records are never split across files). Segments
 *   are opened append-only and never rewritten or truncated; the hash chain
 *   (hash-chain.ts) continues ACROSS segments and restarts, so the whole
 *   directory verifies as one chain. No segment is ever pruned — records, once
 *   written, are never removed (§9); an append failure (e.g. disk full) throws,
 *   halting the loop rather than dropping a record. Archival of closed segments
 *   is deployment-open.
 *
 * Enforcement boundary (honest scope): durability + tamper-evidence at rest
 * (verifyJsonlSink detects any altered, removed, inserted, or reordered line).
 * A total rewrite by a party with full write access requires anchoring the
 * chain head outside their reach (deployment-open). NOT the §9 full-system
 * commit/snapshot, which remains deferred (decisions.ts COMMIT_CADENCE).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { LogRecord, ResistEvent, ActivityEvent, ContextAnchor } from "./resist-event.js";
import type { OpenTags, Provenance, TaggedDatum } from "./tags.js";
import type { LayerIndex } from "../invariants/types.js";
import { MAX_SEGMENT_BYTES } from "./decisions.js";
import {
  CHAIN_GENESIS,
  chainNext,
  verifyChain,
  type ChainedEventLine,
  type ChainVerification,
} from "./hash-chain.js";

/**
 * Serialized form of a datum-bearing record (`scar` or `cycle-seal`): its tag set
 * flattened in fixed order — timestamp, cycle-mark, provenance, floor-tag, open
 * tags (incl. domain) — then the payload, the kind-specific body (ResistEvent or
 * ActivityEvent), and the context anchor. The path a datum travelled is NOT here
 * (§9): it is the stream of lean `layer-exit`/`provenance` lines below.
 */
export interface SerializedDatumRecord {
  readonly form: "scar" | "cycle-seal";
  readonly timestamp: number;
  readonly cycleMark: number | null;
  readonly provenance: Provenance;
  readonly floorTag: LayerIndex;
  readonly open: OpenTags;
  readonly payload: unknown;
  readonly datumId?: string; // cycle-seal
  readonly event?: ResistEvent; // scar
  readonly activity?: ActivityEvent; // cycle-seal
  readonly anchor: ContextAnchor;
}

/** Serialized form of a lean `layer-exit` activity line (a datum exited a layer). */
export interface SerializedLayerExit {
  readonly form: "layer-exit";
  readonly datumId: string;
  readonly cycleMark: number;
  readonly layer: LayerIndex;
  readonly t: number;
}

/** Serialized form of a lean `provenance` activity line (a datum moved from→to). */
export interface SerializedProvenance {
  readonly form: "provenance";
  readonly datumId: string;
  readonly cycleMark: number;
  readonly from: Provenance;
  readonly to: Provenance;
  readonly t: number;
}

/** A serialized [event] line, discriminated by `form`. */
export type SerializedEventRecord =
  | SerializedDatumRecord
  | SerializedLayerExit
  | SerializedProvenance;

function datumForm(
  form: "scar" | "cycle-seal",
  datum: TaggedDatum,
  extra: { event?: ResistEvent; activity?: ActivityEvent; datumId?: string; anchor: ContextAnchor },
): SerializedDatumRecord {
  const f = datum.fixed;
  return {
    form,
    timestamp: f.timestamp,
    cycleMark: f.cycleMark,
    provenance: f.provenance,
    floorTag: f.floorTag,
    open: datum.open,
    payload: datum.payload,
    ...(extra.datumId !== undefined ? { datumId: extra.datumId } : {}),
    ...(extra.event !== undefined ? { event: extra.event } : {}),
    ...(extra.activity !== undefined ? { activity: extra.activity } : {}),
    anchor: extra.anchor,
  };
}

/** Project a LogRecord into its serialized form (tags in fixed order where present). */
export function serializeEventRecord(rec: LogRecord): SerializedEventRecord {
  if (rec.kind === "scar") {
    return datumForm("scar", rec.scar, { event: rec.event, anchor: rec.anchor });
  }
  switch (rec.activityKind) {
    case "cycle-seal":
      return datumForm("cycle-seal", rec.datum, {
        datumId: rec.datumId,
        activity: rec.activity,
        anchor: rec.anchor,
      });
    case "layer-exit":
      return { form: "layer-exit", datumId: rec.datumId, cycleMark: rec.cycleMark, layer: rec.layer, t: rec.t };
    case "provenance":
      return { form: "provenance", datumId: rec.datumId, cycleMark: rec.cycleMark, from: rec.from, to: rec.to, t: rec.t };
  }
}

/**
 * The append-only, write-once sink surface. Intentionally the ONLY method is
 * `write` — no update, delete, or truncate exists to be called.
 */
export interface EventSink {
  write(record: LogRecord): void;
}

/** A JSONL directory sink also exposes close and the current chain head. */
export interface FileEventSink extends EventSink {
  close(): void;
  /**
   * The current chain head (CHAIN_GENESIS while empty). Read-only; a deployment
   * anchors this outside its own write reach to make a total rewrite detectable.
   */
  head(): string;
}

export interface JsonlSinkOptions {
  /** Segment size cap in bytes (DECIDE@IMPL MAX_SEGMENT_BYTES by default). */
  readonly maxSegmentBytes?: number;
  /** UTC yyyymmdd stamp provider — a seam for tests and deployments. */
  readonly dateStamp?: () => string;
}

function utcStamp(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

const SEGMENT_RE = /^event-log-(\d{8})(?:-(\d{3}))?\.jsonl$/;

interface Segment {
  readonly file: string;
  readonly date: string;
  readonly seq: number;
}

/** All segments in the directory, ordered by (date, seq). */
export function listSegments(dir: string): Segment[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((name) => {
      const m = SEGMENT_RE.exec(name);
      return m ? { file: path.join(dir, name), date: m[1]!, seq: m[2] ? Number(m[2]) : 1 } : null;
    })
    .filter((s): s is Segment => s !== null)
    .sort((a, b) => (a.date === b.date ? a.seq - b.seq : a.date < b.date ? -1 : 1));
}

function segmentName(date: string, seq: number): string {
  return seq === 1 ? `event-log-${date}.jsonl` : `event-log-${date}-${String(seq).padStart(3, "0")}.jsonl`;
}

/**
 * Create the segmented JSONL sink over a directory. Resumes the chain from the
 * last line of the last segment; refuses to open on an unparsable tail rather
 * than appending past corruption and burying the evidence.
 */
export function createJsonlFileSink(dir: string, opts: JsonlSinkOptions = {}): FileEventSink {
  const cap = opts.maxSegmentBytes ?? MAX_SEGMENT_BYTES;
  const stamp = opts.dateStamp ?? utcStamp;
  fs.mkdirSync(dir, { recursive: true });

  // Resume the chain from the existing segments, if any.
  let seq = 0;
  let prev = CHAIN_GENESIS;
  const existing = listSegments(dir);
  const lastSeg = existing[existing.length - 1];
  if (lastSeg) {
    const lines = readSegmentLines(lastSeg.file);
    const last = lines[lines.length - 1];
    if (last) {
      if (typeof last.hash !== "string" || typeof last.seq !== "number") {
        throw new Error(
          `event sink: cannot resume chain in ${lastSeg.file} — unparsable tail; refusing to append past corruption`,
        );
      }
      seq = last.seq + 1;
      prev = last.hash;
    }
  }

  let fd: number | null = null;
  let currentDate = "";
  let currentSeq = 0;
  let currentBytes = 0;

  /** Open (or continue) the right segment for `date`, respecting the cap. */
  function openSegment(date: string, lineBytes: number): void {
    if (fd !== null) fs.closeSync(fd);
    // Continue the day's highest segment if it still has room; else the next.
    const todays = listSegments(dir).filter((s) => s.date === date);
    const tail = todays[todays.length - 1];
    let target: Segment;
    if (tail && fs.statSync(tail.file).size + lineBytes <= cap) {
      target = tail;
    } else {
      target = { file: path.join(dir, segmentName(date, (tail?.seq ?? 0) + 1)), date, seq: (tail?.seq ?? 0) + 1 };
    }
    fd = fs.openSync(target.file, "a"); // append-only; never truncates
    currentDate = date;
    currentSeq = target.seq;
    currentBytes = fs.fstatSync(fd).size;
  }

  return {
    write(record: LogRecord): void {
      const chained = chainNext(prev, seq, serializeEventRecord(record));
      const line = JSON.stringify(chained) + "\n";
      const lineBytes = Buffer.byteLength(line, "utf8");
      const today = stamp();
      // Rotate on date change or when the segment would exceed the cap; a
      // record is never split across files.
      if (fd === null || today !== currentDate || currentBytes + lineBytes > cap) {
        openSegment(today, lineBytes);
      }
      fs.writeSync(fd!, line);
      fs.fsyncSync(fd!); // durability: flush to disk before returning
      currentBytes += lineBytes;
      prev = chained.hash;
      seq += 1;
      void currentSeq;
    },
    close(): void {
      if (fd !== null) fs.closeSync(fd);
      fd = null;
    },
    head: () => prev,
  };
}

function readSegmentLines(file: string): ChainedEventLine[] {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ChainedEventLine);
}

/** All chained lines across the directory's segments, in chain order. */
export function readChainedLines(dir: string): ChainedEventLine[] {
  return listSegments(dir).flatMap((s) => readSegmentLines(s.file));
}

/** All serialized records (chain envelope unwrapped), tags in fixed order. */
export function readJsonlSink(dir: string): SerializedEventRecord[] {
  return readChainedLines(dir).map((line) => line.record);
}

/**
 * Reconstruct a LogRecord from its serialized form — the faithful inverse of
 * `serializeEventRecord` (serialization is lossless: the flattened tags + payload
 * + kind-specific body + anchor rebuild the record exactly). This is how an
 * auditor (and a durable, disk-source-of-truth [event] log) reads records back
 * from the substrate.
 */
export function deserializeEventRecord(rec: SerializedEventRecord): LogRecord {
  if (rec.form === "layer-exit") {
    return {
      kind: "activity",
      activityKind: "layer-exit",
      datumId: rec.datumId,
      cycleMark: rec.cycleMark,
      layer: rec.layer,
      t: rec.t,
    };
  }
  if (rec.form === "provenance") {
    return {
      kind: "activity",
      activityKind: "provenance",
      datumId: rec.datumId,
      cycleMark: rec.cycleMark,
      from: rec.from,
      to: rec.to,
      t: rec.t,
    };
  }
  const datum: TaggedDatum = {
    payload: rec.payload,
    fixed: {
      timestamp: rec.timestamp,
      cycleMark: rec.cycleMark,
      provenance: rec.provenance,
      floorTag: rec.floorTag,
    },
    open: rec.open,
  };
  return rec.form === "scar"
    ? { kind: "scar", event: rec.event!, scar: datum, anchor: rec.anchor }
    : {
        kind: "activity",
        activityKind: "cycle-seal",
        datumId: rec.datumId!,
        activity: rec.activity!,
        datum,
        anchor: rec.anchor,
      };
}

/** All LogRecords across the directory's segments, read from the substrate. */
export function readLogRecords(dir: string): LogRecord[] {
  return readJsonlSink(dir).map(deserializeEventRecord);
}

/**
 * Verify the whole chain across all segments: detects any altered, removed,
 * inserted, or reordered line (relative to a trusted head — hash-chain.ts).
 */
export function verifyJsonlSink(dir: string): ChainVerification {
  return verifyChain(readChainedLines(dir));
}
