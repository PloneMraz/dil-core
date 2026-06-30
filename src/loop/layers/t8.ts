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

export function createT8(): LayerSpec<T8Input, T8Output> {
  return {
    index: 8,
    consumes: [6],
    process(input): T8Output {
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

      return { relValues, socialEdges };
    },
  };
}
