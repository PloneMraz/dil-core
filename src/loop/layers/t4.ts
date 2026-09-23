/**
 * T4 — Context Binding (protocol §6.3; stage 4d).
 *
 * Binds content to context, by `entity_id` or STRANGER. An InfoUnit that can be
 * attributed to a known entity is bound to it; one that cannot is bound to
 * STRANGER (a positional unknown, not an error). The resolver is pluggable with
 * a declared default.
 */

import type { LayerSpec } from "../layer.js";
import type { InfoUnit } from "../types.js";

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

/** The share of arriving units that bound to STRANGER (INV-7, up-channel). */
export const STRANGENESS = "strangeness";

export interface T4Input {
  readonly units: readonly InfoUnit[];
}

export interface T4Output {
  readonly bound: readonly BoundInfo[];
}

export function createT4(
  resolve: ContextResolver = defaultResolver,
): LayerSpec<T4Input, T4Output> {
  return {
    index: 4,
    consumes: [3],
    process(input, _field, _emit, contribute): T4Output {
      const bound = input.units.map((unit): BoundInfo => ({
        unit,
        entity_id: resolve(unit),
      }));
      // A FACT T4 can see and no other layer can: how much of what arrived could
      // not be attributed to a known entity. Context novelty, reported and not
      // interpreted — T4 does not decide what follows from it.
      const strangers = bound.filter((b) => b.entity_id === STRANGER).length;
      contribute({ [STRANGENESS]: bound.length > 0 ? strangers / bound.length : 0 });
      return { bound };
    },
    infoUnits: (out) => out.bound.map((b) => b.unit),
  };
}
