/**
 * displayName — a derived human-readable projection of a datum's tags.
 *
 * This DISPLAYS tags as a name; it does NOT store tags in the name. The
 * authoritative tags remain the structured properties on the datum (tags.ts):
 * fixed (with the updatable floor-tag), open (≥3, keyed), and the layer_trace.
 * A name is computed from those on demand, never the source of truth — so the
 * mutable parts (floor-tag, provenance) never force a rename, and keyed open
 * tags are never flattened into lossy positions.
 *
 * The store-kind prefix (`[data]`/`[event]`) is intentionally omitted: kind is
 * carried by storage *location* (the `store/{memory,event-log,commits}/`
 * layout, decisions.ts), not by the name.
 *
 * Example:
 *   [20260630]_[c2]_[running]_[T6]_[domain:financial]_[currency:VND]_[object:revenue]
 */

import type { TaggedDatum } from "./tags.js";
import type { EventRecord } from "./resist-event.js";

/** Format an epoch-millisecond timestamp as YYYYMMDD in UTC (deterministic). */
function yyyymmdd(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** Open-tag entries with `domain` first, then the rest sorted by key. */
function orderedOpen(open: Readonly<Record<string, string>>): [string, string][] {
  return Object.entries(open).sort(([a], [b]) => {
    if (a === "domain") return -1;
    if (b === "domain") return 1;
    return a.localeCompare(b);
  });
}

/**
 * Project a datum's tags into a display name. Renders the fixed layer
 * (date, cycle-mark, provenance, floor-tag) then every open tag as `key:value`
 * (keys preserved, so the name stays filterable). The cycle-mark of a `prior`
 * (null) renders as `c-`.
 */
export function displayName(datum: TaggedDatum): string {
  const { timestamp, cycleMark, provenance, floorTag } = datum.fixed;
  const parts = [
    `[${yyyymmdd(timestamp)}]`,
    `[c${cycleMark ?? "-"}]`,
    `[${provenance}]`,
    `[T${floorTag}]`,
    ...orderedOpen(datum.open).map(([k, v]) => `[${k}:${v}]`),
  ];
  return parts.join("_");
}

/**
 * Project an [event] record into a display name. Since the event inherits the
 * scar's tags, the name is the scar's display name plus the mismatch kind.
 */
export function eventDisplayName(record: EventRecord): string {
  return `${displayName(record.scar)}_[${record.event.mismatch_kind}]`;
}
