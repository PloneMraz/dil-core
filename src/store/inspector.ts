/**
 * The inspector — a READ-ONLY human-readable view of the store.
 *
 * Lets a person see what is in `[data]` and `[event]` when they access the
 * store, using the derived displayName projection (display-name.ts). It only
 * reads — it calls the stores' read methods (`entries()`, `all()`) and never
 * mutates — so inspecting can never alter the store or an `[event]` record.
 *
 * This renders to a string; the caller decides where to send it (stdout, a
 * file, a test). Wiring it to a live daemon is stage-5 work; the rendering is
 * complete and testable now.
 */

import type { DataStore } from "./data-store.js";
import type { EventLog } from "./event-log.js";
import { displayName, eventDisplayName } from "./display-name.js";

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
        return `  #${i}  [layer-exit] ${r.datumId} @T${r.layer} (c${r.cycleMark})`;
      case "provenance":
        return `  #${i}  [provenance] ${r.datumId} ${r.from}→${r.to} (c${r.cycleMark})`;
    }
  });
  return [`[event-log] — ${records.length} record(s)`, ...lines].join("\n");
}
