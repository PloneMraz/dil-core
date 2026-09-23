/**
 * T8 — Multi-Entity Abstraction (protocol §6.3; stage 4d).
 *
 * Builds RelValue and SocialEdge as the entity count N grows, and closes the
 * loop (the cycle driver feeds T8 back to T1 — INV-1). RelValue exists only when
 * N ≥ 2 (a relative rank needs something to be relative to). SocialEdge records
 * an Other↔Other interaction with no self present.
 *
 * T8-INV (INV-2): an `=` appears only when cognition has stopped. T8's output is
 * a relative, revisable correlation (`↔`), never a frozen identity — wired by
 * asserting the output register is correlational.
 *
 * T8 does NOT set the width of attention, though it was tried here first. T8
 * ranks the Others PRESENT this cycle, and `input.others` carries only those —
 * so in a host where one entity returns per cycle T8 sees N = 1 every time and
 * the width never moves. Measured on a live host: the gain sat at 1.0 for the
 * whole run. How many Others the loop is holding is accrued knowledge, and the
 * layer that accrues it is T6.
 */

import { assertCorrelational } from "../../invariants/guards.js";
import type { LayerSpec } from "../layer.js";
import type { OtherModel, RelValue, SocialEdge } from "../types.js";
import type { IndependenceEvidence } from "./t6.js";

export interface T8Input {
  readonly others: readonly OtherModel[];
  readonly interactions?: readonly {
    readonly a_id: string;
    readonly b_id: string;
    readonly observed_interaction: unknown;
  }[];
}

export interface T8Output {
  readonly relValues: readonly RelValue[];
  readonly socialEdges: readonly SocialEdge[];
}

function resistancesOf(other: OtherModel): number {
  const ev = other.independence_evidence as Partial<IndependenceEvidence> | null;
  return typeof ev?.resistances === "number" ? ev.resistances : 0;
}

/** How many Other↔Other interactions T8 recorded this cycle (INV-7, up-channel). */
export const INTERACTIONS = "interactions";

/**
 * The share of all resistance held by the most-resisting Other (INV-7,
 * up-channel). 1 means one Other is doing all the resisting; 1/N means it is
 * spread evenly; 0 means nothing has resisted yet.
 */
export const RESISTANCE_CONCENTRATION = "resistanceConcentration";

export function createT8(): LayerSpec<T8Input, T8Output> {
  return {
    index: 8,
    consumes: [6],
    process(input, _field, _emit, contribute): T8Output {
      // RelValue exists only when N ≥ 2.
      let relValues: RelValue[] = [];
      if (input.others.length >= 2) {
        const ranked = [...input.others].sort(
          (a, b) => resistancesOf(b) - resistancesOf(a),
        );
        relValues = ranked.map((other, i) => ({
          entity_id: other.entity_id,
          relative_rank: i + 1,
          comparison_basis: "resistance",
        }));
      }

      const socialEdges: SocialEdge[] = (input.interactions ?? []).map((it) => ({
        a_id: it.a_id,
        b_id: it.b_id,
        observed_interaction: it.observed_interaction,
      }));

      // T8-INV / INV-2: the abstraction is a live correlation, never an identity.
      assertCorrelational({
        tag: "INFO",
        register: "↔",
        note: "T8 multi-entity abstraction",
      });

      // T8 CLOSES BACK INTO THE LOOP (INV-1, §6.2: "T8 closes back into the
      // loop, not into a sink"). Nothing read T8's output: relValues and
      // socialEdges were produced and dropped, so the top of the meaning-channel
      // was a dead branch. The meaning-channel cannot carry them back down —
      // INV-3 forbids it — but the field can, and does from N+1. So T8 reports
      // what only it can see: the relative picture of the Others, and how many
      // of them met each other.
      const resistances = input.others.map(resistancesOf);
      const total = resistances.reduce((a, b) => a + b, 0);
      contribute({
        [INTERACTIONS]: socialEdges.length,
        [RESISTANCE_CONCENTRATION]: total > 0 ? Math.max(...resistances) / total : 0,
      });

      return { relValues, socialEdges };
    },
  };
}
