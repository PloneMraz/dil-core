/**
 * The inspector — a READ-ONLY human-readable view of the store.
 *
 * Lets a person see what is in `[data]` and `[event]` when they access the
 * store, using the derived displayName projection (display-name.ts). It only
 * reads — it calls the stores' read methods (`entries()`, `all()`) and never
 * mutates — so inspecting can never alter the store or an `[event]` record.
 *
 * This renders to a string; the caller decides where to send it (stdout, a
 * file, a test). It is a standalone read-only view — a deployment or tool points
 * it at a live daemon's stores where an operator wants to look; the loop itself
 * never depends on it.
 */

import type { DataStore } from "./data-store.js";
import type { EventLog } from "./event-log.js";
import { displayName, eventDisplayName } from "./display-name.js";

/** Render an epoch-ms timestamp as HH:mm:ss UTC (the wall-clock of the event). */
function clock(ts: number): string {
  const d = new Date(ts);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** A short, safe one-line preview of an arbitrary payload value. */
function preview(value: unknown, max = 40): string {
  let s: string;
  if (typeof value === "string") {
    s = value;
  } else {
    try {
      s = JSON.stringify(value) ?? String(value);
    } catch {
      s = String(value);
    }
  }
  s = s.replace(/\s+/g, " ");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Render the `[data]` store: one line per datum, with its derived name. */
export function inspectData(store: DataStore): string {
  const entries = store.entries();
  const lines = entries.map(
    ([id, d]) => `  ${id}  ${displayName(d)}  payload=${preview(d.payload)}`,
  );
  return [`[data] — ${entries.length} item(s)`, ...lines].join("\n");
}

/** Render the `[event]` log: one line per activity/scar (the datum's diary). */
export function inspectEventLog(log: EventLog): string {
  const records = log.all();
  const lines = records.map((r, i) => {
    if (r.kind === "scar") {
      return `  #${i}  ${eventDisplayName(r)}  ${preview(r.event.expected)}→${preview(r.event.received)}`;
    }
    switch (r.activityKind) {
      case "cycle-seal":
        return `  #${i}  ${displayName(r.datum)}_[cycle-seal]  cycle=${r.activity.cycle} flow=${r.activity.flow} observed=${r.activity.observed.join(",") || "-"} scars=${r.activity.scars}`;
      case "layer-exit":
        return `  #${i}  [layer-exit] ${r.datumId} @T${r.layer} (c${r.cycleMark}) ${clock(r.t)}`;
      case "provenance":
        return `  #${i}  [provenance] ${r.datumId} ${r.from}→${r.to} (c${r.cycleMark}) ${clock(r.t)}`;
      case "emission":
        return `  #${i}  [emission] ${r.datumId} @T${r.issuingLayer} ${r.register} ${preview(r.action)} (c${r.cycleMark}) ${clock(r.t)}`;
      case "crystallization":
        return `  #${i}  [crystallization] ${r.datumId} self|env (c${r.cycleMark}) ${clock(r.t)}`;
      case "expectation":
        return `  #${i}  [expectation] ${r.entity} conf=${r.confidence.toFixed(2)} rec=${r.recurrence} err=${r.delta} (c${r.cycleMark}) ${clock(r.t)}`;
    }
  });
  return [`[event-log] — ${records.length} record(s)`, ...lines].join("\n");
}
