/**
 * Full-system snapshot / restore orchestration (protocol §9; choice 2-(a):
 * one whole-state payload per marker).
 *
 * The snapshot covers the ENTIRE system, not just the store: the stateful
 * layers' accrued state (T2/T5/T6/T7 via their Snapshottable surfaces), the
 * GLOB-MOD field, the cycle driver (cycle counter + last emission), and the
 * [data] working memory. Restoring re-instates state this very loop accrued —
 * resuming the causal line, never pre-loading fabricated history (INV-5) — and
 * rewrites ONLY store/memory/-side state: the [event] log and the markers are
 * never touched by a restore.
 */

import { isSnapshottable } from "../loop/layer.js";
import type { Layers, DriverState } from "../loop/cycle.js";
import type { GlobMod } from "../loop/glob-mod.js";
import type { DataStore } from "../store/data-store.js";
import type { TaggedDatum } from "../store/tags.js";

/** The whole-system state behind one marker's stateHash. */
export interface SystemSnapshot {
  readonly layers: Readonly<Record<string, unknown>>;
  readonly glob: { readonly params: Readonly<Record<string, number>>; readonly cycle: number };
  readonly driver: DriverState;
  readonly data: readonly (readonly [string, TaggedDatum])[];
}

const STATEFUL = ["t2", "t5", "t6", "t7"] as const;

export function takeSnapshot(
  layers: Layers,
  glob: GlobMod,
  driver: DriverState,
  data: DataStore,
): SystemSnapshot {
  const layerState: Record<string, unknown> = {};
  for (const key of STATEFUL) {
    const spec = layers[key];
    if (isSnapshottable(spec)) layerState[key] = spec.snapshot();
  }
  return {
    layers: layerState,
    glob: { params: glob.current().params, cycle: glob.cycle() },
    driver,
    data: data.entries(),
  };
}

/** Restore everything but the driver; returns the driver state to resume with. */
export function restoreSnapshot(
  snap: SystemSnapshot,
  layers: Layers,
  glob: GlobMod,
  data: DataStore,
): DriverState {
  for (const key of STATEFUL) {
    const spec = layers[key];
    const state = snap.layers[key];
    if (state !== undefined && isSnapshottable(spec)) spec.restore(state);
  }
  glob.restore(snap.glob.params, snap.glob.cycle);
  data.clear();
  for (const [k, v] of snap.data) data.put(k, v);
  return snap.driver;
}
