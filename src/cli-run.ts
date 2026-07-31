/**
 * `dil` — a thin, READ-ONLY command line over a durable DIL store on disk.
 *
 * This is a front door, not new machinery: every command is a thin wrapper over
 * an already-exported, already-tested function (verifyJsonlSink, inspectEventLog,
 * checkConformance/renderConformance). Its purpose is the one the conformance
 * design is built around — letting a THIRD PARTY read a foreign `[event]` store
 * from disk and judge it, without writing code. It only ever reads: it opens no
 * writable sink, creates nothing, and mutates nothing.
 *
 * `run(argv, out, err)` is pure over its injected streams and returns an exit
 * code (0 ok · 1 usage/path error · 2 verification failed), so it is unit-testable
 * without spawning a process; `cli.ts` is the tiny executable entry that calls it.
 */

import * as fs from "node:fs";
import { layoutFor } from "./store/substrate.js";
import { verifyJsonlSink, readLogRecords } from "./store/event-sink.js";
import { inspectEventLog } from "./store/inspector.js";
import { checkConformance } from "./conformance/checker.js";
import { renderConformance } from "./conformance/render.js";
import type { EventLog } from "./store/event-log.js";
import type { EventRecord } from "./store/resist-event.js";

/** A write sink for output — process.stdout/stderr in production, a capture in tests. */
export interface Out {
  write(s: string): void;
}

export const USAGE = `dil — read-only audit of a DIL [event] store on disk

Usage:
  dil verify <store-dir>       verify the [event] hash chain (tamper-evidence)
  dil inspect <store-dir>      print the [event] datum-activity journal
  dil conformance <store-dir>  score the §13 conformance criteria from traces
  dil --help                   this message

<store-dir> is the host store root — the directory that holds store/event-log/.
A third party can point this at a foreign store and read its trace; nothing is
written. \`conformance\` reads only what the log carries: with no gate available
from disk, §13.2 Host is honestly reported as unverifiable, not assumed.
`;

/**
 * A truly read-only [event] log over the substrate: it deserializes the records
 * once and serves them. No writable sink is opened, so nothing on disk is created
 * or touched — the CLI is an observer, not a participant.
 */
function readOnlyLog(records: readonly import("./store/resist-event.js").LogRecord[]): EventLog {
  return {
    all: () => records,
    size: () => records.length,
    bySourceId: (id: string) =>
      records.filter((r): r is EventRecord => r.kind === "scar" && r.event.source_id === id),
    append: () => {
      throw new Error("dil: this is a read-only audit view — the [event] log cannot be appended to here");
    },
  };
}

/** Resolve the store root to its event-log directory, or write an error and return null. */
function resolveEventLog(dir: string | undefined, err: Out): string | null {
  if (dir === undefined) {
    err.write("dil: missing <store-dir> (try `dil --help`)\n");
    return null;
  }
  if (!fs.existsSync(dir)) {
    err.write(`dil: no such directory: ${dir}\n`);
    return null;
  }
  const eventLog = layoutFor(dir).eventLog;
  if (!fs.existsSync(eventLog)) {
    err.write(`dil: not a DIL store: expected ${eventLog} (store/event-log/ under ${dir})\n`);
    return null;
  }
  return eventLog;
}

/** Run one CLI invocation. Returns the exit code; never calls process.exit. */
export function run(argv: readonly string[], out: Out, err: Out): number {
  const [cmd, arg] = argv;

  if (cmd === undefined) {
    err.write(USAGE);
    return 1; // no command is a usage error
  }
  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    out.write(USAGE);
    return 0;
  }

  if (cmd === "verify" || cmd === "inspect" || cmd === "conformance") {
    const eventLog = resolveEventLog(arg, err);
    if (eventLog === null) return 1;
    try {
      switch (cmd) {
        case "verify": {
          const v = verifyJsonlSink(eventLog);
          if (v.ok) {
            out.write(`ok — ${v.count} record(s), head ${v.head}\n`);
            return 0;
          }
          out.write(`BROKEN at line ${v.atLine}: ${v.reason}\n`);
          return 2; // ran fine, but the chain does not verify
        }
        case "inspect": {
          out.write(inspectEventLog(readOnlyLog(readLogRecords(eventLog))) + "\n");
          return 0;
        }
        case "conformance": {
          out.write(renderConformance(checkConformance(readOnlyLog(readLogRecords(eventLog)), {})) + "\n");
          return 0;
        }
      }
    } catch (e) {
      // A malformed/corrupt store surfaces as an honest error, not a stack trace.
      err.write(`dil: cannot read the store at ${eventLog}: ${(e as Error).message}\n`);
      return 2;
    }
  }

  err.write(`dil: unknown command "${cmd}" (try \`dil --help\`)\n`);
  return 1;
}
