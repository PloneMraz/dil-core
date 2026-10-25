/**
 * The cycle's view of `[event]` for T5 (v0.3.9 §9, "Reading the record").
 *
 * The whole store is the agent's history: `[data]` its memory, which it revises,
 * and `[event]` the record of what happened to it, which it reads and never
 * alters. This is the reading. It is an open link, not a switch: the driver
 * builds one every cycle and hands it to the rule, and whether to read is the
 * rule's.
 *
 * It takes a ReadableEventLog and nothing more, so it cannot append to the log,
 * reach into `[data]` or correct the store. It sees what the log held before the
 * cycle that reads (`before`, a place in the chain): what is being appended in
 * this cycle is met in it, not yet history. Each way of reading goes back from
 * there, newest first, through at most `scan` records — read only as far as it
 * needs — and returns at most `limit`; what it returns is what was read, and `onRead` is told, by purpose,
 * so the driver records it — a layer does not write the log.
 */

import type { ReadableEventLog, SeqRecord } from "../store/event-log.js";
export { recordSeq } from "../store/event-log.js";
import type { LogRecord } from "../store/resist-event.js";
import type { RecordView } from "./layers/t5.js";
import { RECORD_SCAN } from "./decisions.js";

/**
 * The datum a record is of: the one it names, or for a scar with none — an
 * absence — the cycle datum that stood for it. The manifest is of none.
 */
function datumOf(record: LogRecord): string | undefined {
  if (record.kind === "scar") return record.datumId ?? `cycle-${record.anchor.cycle}`;
  if (record.kind === "activity") return record.datumId;
  return undefined;
}

export function createRecordView(
  log: ReadableEventLog,
  before: number,
  onRead: (purpose: string, seqs: readonly number[]) => void,
  scan: number = RECORD_SCAN,
): RecordView {
  function read(purpose: string, keep: (r: LogRecord) => boolean, limit: number): readonly SeqRecord[] {
    const out: SeqRecord[] = [];
    if (limit <= 0) return out;
    for (const r of log.iterBack(before, scan)) {
      if (!keep(r.record)) continue;
      out.push(r);
      if (out.length >= limit) break;
    }
    if (out.length > 0) onRead(purpose, out.map((r) => r.seq));
    return out;
  }
  return {
    recent: (purpose, limit = scan) => read(purpose, () => true, limit),
    about: (datumId, purpose, limit = scan) => read(purpose, (r) => datumOf(r) === datumId, limit),
    scars: (sourceId, purpose, limit = scan) =>
      read(purpose, (r) => r.kind === "scar" && r.event.source_id === sourceId, limit),
    cycles: (purpose, limit = scan) =>
      read(purpose, (r) => r.kind === "activity" && r.activityKind === "cycle-seal", limit),
  };
}
