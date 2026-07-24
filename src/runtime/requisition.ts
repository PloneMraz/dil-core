/**
 * Requisition — DIL imposes its store law on the host's substrate at startup
 * (CONTEXT.md §1, §5, §6; the sovereign principle).
 *
 * This is "the king sits down": run once at startup (after the precondition gate
 * qualifies), it takes the host's raw durable substrate and imposes DIL's entire
 * store law on it. In order:
 *   1. claim the substrate + lay out store/{memory,event-log,commits} + DIL-CLAIM
 *      (refuse a foreign/incompatible claim);
 *   2. bind the durable stores DIL rules on it: `[data]` (SQLite under memory/),
 *      `[event]` (append-only hash-chained JSONL under event-log/), and the
 *      commit DAG (under commits/);
 *   3. SCAN the host's pre-existing memory and force every item through the
 *      tagging-gate — vetted and stamped `prior` — before it enters `[data]`.
 *      Nothing enters the store untagged (§9, no side door); an item that cannot
 *      be admitted cleanly is rejected and reported, not smuggled in.
 *
 * DIL does not import host content wholesale and does not conform to the host's
 * storage format — it requisitions raw physical memory and rules it.
 */

import * as path from "node:path";

import { claimSubstrate, type StoreLayout } from "../store/substrate.js";
import { createSqliteDataStore, type SqliteDataStore } from "../store/sqlite-data-store.js";
import { createDurableEventLog, type DurableEventLog } from "../store/event-log.js";
import { createDirCommitStore, type CommitStore } from "../store/commit-store.js";
import { admitHostData } from "../store/tagging-gate.js";
import type { LayerIndex } from "../invariants/types.js";
import type { HostDeclaration } from "../host/declaration.js";

export class RequisitionError extends Error {
  constructor(detail: string) {
    super(`DIL cannot requisition the host: ${detail}`);
    this.name = "RequisitionError";
    Object.setPrototypeOf(this, RequisitionError.prototype);
  }
}

/** The durable stores DIL rules on the requisitioned substrate, plus the scan report. */
export interface Requisitioned {
  readonly layout: StoreLayout;
  readonly data: SqliteDataStore;
  readonly events: DurableEventLog;
  readonly commits: CommitStore;
  /** Pre-existing host items admitted as `prior`. */
  readonly admitted: number;
  /** Items the host offered that failed vetting (not admitted; reported, not smuggled). */
  readonly rejected: readonly { readonly id: string; readonly reason: string }[];
  /** Release the durable handles (SQLite + [event] sink). */
  close(): void;
}

/**
 * Requisition the host's substrate and impose DIL's store law. Throws
 * RequisitionError if the host declares no substrate; SubstrateClaimError if the
 * substrate carries a foreign/incompatible claim (both surface as a clean
 * non-start at the daemon).
 */
export function requisition(host: HostDeclaration, now: number = Date.now()): Requisitioned {
  const root = host.store.root;
  if (root === undefined) {
    throw new RequisitionError(
      "host declares no durable substrate (store.root); DIL requisitions physical memory, it does not run its store in RAM",
    );
  }

  const layout = claimSubstrate(root);
  const data = createSqliteDataStore(path.join(layout.memory, "data.sqlite"));
  const events = createDurableEventLog(layout.eventLog);
  const commits = createDirCommitStore(layout.commits);

  // Scan the host's pre-existing memory; admit each through the tagging-gate as
  // `prior`. No side door: an item that cannot be honestly tagged is rejected.
  let admitted = 0;
  const rejected: { id: string; reason: string }[] = [];
  const pre = host.store.preexisting;
  if (pre) {
    for (const item of pre.scan()) {
      try {
        const datum = admitHostData(
          {
            payload: item.payload,
            admittingLayer: (item.admittingLayer ?? 1) as LayerIndex,
            open: item.open,
          },
          now,
        );
        data.put(item.id, datum);
        admitted += 1;
      } catch (err) {
        rejected.push({ id: item.id, reason: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return {
    layout,
    data,
    events,
    commits,
    admitted,
    rejected,
    close() {
      data.close();
      events.close();
    },
  };
}
