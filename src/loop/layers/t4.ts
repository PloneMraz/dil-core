/**
 * T4 — Context Binding (protocol §6.3; stage 4d).
 *
 * Binds content to context, by `entity_id` or STRANGER. An InfoUnit that can be
 * attributed to a known entity is bound to it; one that cannot is bound to
 * STRANGER (a positional unknown, not an error). The resolver is pluggable with
 * a declared default.
 *
 * THE FIELD (INV-7). T4 reads `trust`: how many sightings a named entity takes
 * before it is bound by its name rather than STRANGER (T4_RECOGNITION) — one at
 * NEUTRAL, the reference behaviour; more with less trust. The arrival is
 * registered either way. It votes `trust` from what only it sees: the share of
 * this cycle's arrivals it could bind to a known entity.
 */

import type { LayerSpec, Snapshottable } from "../layer.js";
import type { InfoUnit } from "../types.js";
import { T4_RECOGNITION } from "../decisions.js";
import { TRUST, axis, castVotes, falling, share, shiftedCount } from "../field.js";

/** The positional "unknown entity" binding. */
export const STRANGER = "STRANGER";

/** Resolves which entity an InfoUnit concerns, or STRANGER (DECIDE@IMPL). */
export type ContextResolver = (unit: InfoUnit) => string;

/** Default resolver: an `entity` field in the unit's value, else STRANGER. */
const defaultResolver: ContextResolver = (unit) => {
  const content = unit.content as { value?: unknown };
  const value = content?.value;
  if (value && typeof value === "object" && "entity" in value) {
    const entity = (value as { entity: unknown }).entity;
    if (typeof entity === "string" && entity.length > 0) return entity;
  }
  return STRANGER;
};

export interface BoundInfo {
  readonly unit: InfoUnit;
  /** The entity this unit concerns, or STRANGER. */
  readonly entity_id: string;
}

export interface T4Input {
  readonly units: readonly InfoUnit[];
}

export interface T4Output {
  readonly bound: readonly BoundInfo[];
}

export function createT4(
  resolve: ContextResolver = defaultResolver,
): LayerSpec<T4Input, T4Output> & Snapshottable {
  // How often each named entity has been sighted (INV-5: accrued, never loaded).
  const sightings = new Map<string, number>();

  return {
    index: 4,
    consumes: [3],
    snapshot: () => ({ sightings: [...sightings.entries()] }),
    restore(state: unknown): void {
      sightings.clear();
      for (const [k, v] of (state as { sightings?: [string, number][] }).sightings ?? []) {
        sightings.set(k, v);
      }
    },
    process(input, field, _emit, contribute): T4Output {
      const recognition = shiftedCount(T4_RECOGNITION, falling(axis(field, TRUST)));
      const bound = input.units.map((unit): BoundInfo => {
        const named = resolve(unit);
        if (named === STRANGER) return { unit, entity_id: STRANGER };
        const seen = (sightings.get(named) ?? 0) + 1;
        sightings.set(named, seen);
        return { unit, entity_id: seen >= recognition ? named : STRANGER };
      });
      const known = bound.filter((b) => b.entity_id !== STRANGER).length;
      castVotes(contribute, { [TRUST]: share(known, bound.length) });
      return { bound };
    },
    infoUnits: (out) => out.bound.map((b) => b.unit),
  };
}
