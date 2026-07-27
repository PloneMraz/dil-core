/**
 * Tamper-evidence for the [event] log at rest (toward protocol §9's
 * content-addressed direction).
 *
 * Each persisted record is chained: line N carries `prev` (the hash of line
 * N−1) and `hash` (sha256 over seq + prev + the serialized record). A verifier
 * walking the file detects ANY alteration, removal, insertion, or reordering of
 * a line: the chain breaks at that point and every later line inherits the
 * break.
 *
 * HONEST SCOPE, declared not implied:
 *   - Detection is relative to a trusted head. An adversary with full write
 *     access to the file can rewrite the WHOLE chain consistently; detecting a
 *     total rewrite requires anchoring the chain head outside their reach
 *     (publish it to the user, an external log, …) — that anchoring is a
 *     deployment concern, deliberately open like tag D.
 *   - This protects the log AT REST. In-process tampering defeats any
 *     in-process check by definition; the in-memory log's guard remains
 *     deep-freeze + no-mutation API.
 *   - The §9 full-system commit/snapshot is the commit repo's job
 *     (commit-store.ts); its markers pin this chain's head, and an external
 *     copy of a marker anchors the whole chain.
 *
 * Canonicalization: the hash covers `JSON.stringify(record)`. Records are
 * built with fixed key order (serializeEventRecord) and JSON round-trips
 * preserve string-key order in Node, so write-side and verify-side
 * serializations agree.
 */

import { createHash } from "node:crypto";
import type { SerializedEventRecord } from "./event-sink.js";
import { SCHEMA_VERSION } from "./decisions.js";

/** The `prev` of the first line — no predecessor. */
export const CHAIN_GENESIS = "0".repeat(64);

/** One persisted, chained line of the [event] file. */
export interface ChainedEventLine {
  /** Position in the chain, contiguous from 0. */
  readonly seq: number;
  /** Hash of the previous line (CHAIN_GENESIS for the first). */
  readonly prev: string;
  /**
   * The store schema version this line was written under (decisions.ts). Because
   * `[event]` is immutable, the line is self-describing: a reader interprets its
   * record by THIS version, and a log may hold lines of several versions after a
   * schema change. Stamped into the hash, so it is tamper-evident.
   */
  readonly schemaVersion: number;
  /** The record body, tags in fixed order (event-sink.ts). */
  readonly record: SerializedEventRecord;
  /** sha256 over seq + prev + schemaVersion + record. */
  readonly hash: string;
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** The hash a well-formed line must carry (covers the line's own schema version). */
export function hashChainEntry(
  seq: number,
  prev: string,
  schemaVersion: number,
  record: SerializedEventRecord,
): string {
  return sha256(`${seq}\n${prev}\n${schemaVersion}\n${JSON.stringify(record)}`);
}

/** Build the next chained line after `prevHash`, stamped with the current schema. */
export function chainNext(
  prevHash: string,
  seq: number,
  record: SerializedEventRecord,
): ChainedEventLine {
  return {
    seq,
    prev: prevHash,
    schemaVersion: SCHEMA_VERSION,
    record,
    hash: hashChainEntry(seq, prevHash, SCHEMA_VERSION, record),
  };
}

export type ChainVerification =
  | { readonly ok: true; readonly count: number; readonly head: string }
  | { readonly ok: false; readonly atLine: number; readonly reason: string };

/**
 * Walk the chain and verify every link. Returns the head hash on success, or
 * the first broken line and why. An empty chain is vacuously ok with the
 * genesis head.
 */
export function verifyChain(lines: readonly ChainedEventLine[]): ChainVerification {
  let prev = CHAIN_GENESIS;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.seq !== i) {
      return { ok: false, atLine: i, reason: `sequence break: expected seq ${i}, found ${line.seq}` };
    }
    if (line.prev !== prev) {
      return { ok: false, atLine: i, reason: "chain break: prev does not match the previous line's hash" };
    }
    if (line.hash !== hashChainEntry(line.seq, line.prev, line.schemaVersion, line.record)) {
      return { ok: false, atLine: i, reason: "content break: hash does not match the record" };
    }
    prev = line.hash;
  }
  return { ok: true, count: lines.length, head: prev };
}
