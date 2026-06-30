/**
 * GLOB-MOD — the modulatory field (protocol §5 INV-7, §6.2; stage 4b).
 *
 * A single background state reaching every layer field-to-layer: each layer
 * reads it as the disposition with which it reads its input, and contributes to
 * it as one competing parameter. It carries *how to read* (gains/biases), never
 * *what is read*.
 *
 * The update law is declared in decisions.ts (GLOB_MOD_UPDATE_LAW, "option A"):
 * a convex per-key weighted average of a cycle's contributions, untouched keys
 * carrying over, taking effect at N+1. Two structural guarantees:
 *   - N+1, never within-cycle: contributions land in a `pending` buffer; the
 *     active field changes only at `advance()`. `advance()` routes through
 *     assertGlobModUpdate, which halts on last-write or a within-cycle effect.
 *   - No runaway by construction: a convex combination of the contributions is
 *     always within their range, so the field cannot amplify itself from within
 *     (INV-7 note: "no gain cap is needed").
 */

import { assertGlobModUpdate } from "../invariants/guards.js";
import type { LayerIndex } from "../invariants/types.js";
import type { ModField } from "./types.js";

export class GlobModError extends Error {
  constructor(detail: string) {
    super(`GLOB-MOD: ${detail}`);
    this.name = "GlobModError";
    Object.setPrototypeOf(this, GlobModError.prototype);
  }
}

/** One layer's contribution to the field for the current cycle. */
interface Contribution {
  readonly layer: LayerIndex;
  readonly params: Readonly<Record<string, number>>;
  readonly weight: number;
}

export interface GlobMod {
  /** The active field this cycle — immutable within the cycle. */
  current(): ModField;
  /** The cycle the active field belongs to. */
  cycle(): number;
  /**
   * A layer competes for one or more param keys this cycle, with a non-negative
   * weight. Recorded into the pending buffer; does NOT change the active field.
   */
  contribute(
    layer: LayerIndex,
    params: Readonly<Record<string, number>>,
    weight: number,
  ): void;
  /**
   * Close the cycle: blend the pending contributions into the field for
   * `nextCycle` (which MUST be later than the current cycle), clear pending, and
   * return the new active field.
   */
  advance(nextCycle: number): ModField;
}

/** Freeze a params map so an active field cannot be mutated within its cycle. */
function freezeField(params: Record<string, number>, t: number): ModField {
  return { params: Object.freeze({ ...params }), t };
}

/**
 * Convex per-key weighted average of the contributions, over the previous
 * params. Keys with positive total weight get Σ(wᵢ·vᵢ)/Σ(wᵢ); every other key
 * carries over unchanged.
 */
function blend(
  prev: Readonly<Record<string, number>>,
  contributions: readonly Contribution[],
): Record<string, number> {
  const weightedSum: Record<string, number> = {};
  const weightTotal: Record<string, number> = {};
  for (const c of contributions) {
    for (const [key, value] of Object.entries(c.params)) {
      weightedSum[key] = (weightedSum[key] ?? 0) + c.weight * value;
      weightTotal[key] = (weightTotal[key] ?? 0) + c.weight;
    }
  }
  const next: Record<string, number> = { ...prev };
  for (const key of Object.keys(weightedSum)) {
    const w = weightTotal[key] ?? 0;
    if (w > 0) {
      next[key] = weightedSum[key]! / w;
    }
  }
  return next;
}

export function createGlobMod(
  initialParams: Readonly<Record<string, number>> = {},
  cycle = 0,
): GlobMod {
  let field = freezeField({ ...initialParams }, cycle);
  let currentCycle = cycle;
  let pending: Contribution[] = [];

  return {
    current: () => field,
    cycle: () => currentCycle,
    contribute(layer, params, weight) {
      if (!Number.isFinite(weight) || weight < 0) {
        throw new GlobModError(
          `contribution weight must be finite and non-negative (convexity), got ${weight}`,
        );
      }
      pending.push({ layer, params: { ...params }, weight });
    },
    advance(nextCycle) {
      // INV-7: blend (never last-write) and take effect strictly later (N+1).
      assertGlobModUpdate({
        mode: "blend",
        contribCycle: currentCycle,
        effectCycle: nextCycle,
      });
      field = freezeField(blend(field.params, pending), nextCycle);
      currentCycle = nextCycle;
      pending = [];
      return field;
    },
  };
}
