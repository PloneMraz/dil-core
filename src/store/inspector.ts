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
import type { LayerTrace } from "./tags.js";
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

/** Render a layer_trace as a path, e.g. 1>5>7. */
function tracePath(trace: LayerTrace): string {
  return trace.join(">");
}

/** Render the `[data]` store: one line per datum, with its derived name. */
export function inspectData(store: DataStore): string {
  const entries = store.entries();
  const lines = entries.map(
    ([id, d]) =>
      `  ${id}  ${displayName(d)}  trace=${tracePath(d.trace)}  payload=${preview(d.payload)}`,
  );
  return [`[data] — ${entries.length} item(s)`, ...lines].join("\n");
}

/** Render the `[event]` log: one line per record (scar or activity). */
export function inspectEventLog(log: EventLog): string {
  const records = log.all();
  const lines = records.map((r, i) =>
    r.kind === "scar"
      ? `  #${i}  ${eventDisplayName(r)}  ${preview(r.event.expected)}→${preview(r.event.received)}  trace=${tracePath(r.scar.trace)}`
      : `  #${i}  ${displayName(r.datum)}_[activity]  cycle=${r.activity.cycle} flow=${r.activity.flow} observed=${r.activity.observed.join(",") || "-"} scars=${r.activity.scars}`,
  );
  return [`[event-log] — ${records.length} record(s)`, ...lines].join("\n");
}
