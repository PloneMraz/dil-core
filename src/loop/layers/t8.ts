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
 * T8 ALSO SETS THE WIDTH OF ATTENTION (INV-7). It is the one layer that sees how
 * many Others there are at once, so it is the one that can say how thinly
 * attention is spread. It contributes `attentionGain` inversely to N: attending
 * to four things is not attending to one thing four times over. The field then
 * carries that to every layer from N+1 — T7 reads it as how long an entity stays
 * expected, and nothing has to be hand-tuned per host.
 *
 * This is the up-channel INV-7 always described and nothing could use: "Every
 * layer contributes to it as one competing parameter". T8 contributing here does
 * NOT breach INV-3, which governs the meaning-channel; §5 says plainly that "when
 * an upper layer alters GLOB-MOD it changes the field, which then conditions
 * every layer from above", and the conditioning still lands only at N+1.
 *
 * The gain is inert unless a host declares a finite attention span: Infinity
 * scaled by anything is still Infinity, so the reference behaviour — attend to
 * everything, for ever — is what a silent host keeps.
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

/**
 * The field parameter T8 sets: how wide attention is, given how many Others the
 * loop is holding at once.
 */
export const ATTENTION_GAIN_PARAM = "attentionGain";

/**
 * Attention width for N Others (DECIDE@IMPL, tunable and NOT derived).
 *
 * 1/N: attending to four things is not attending to one thing four times over.
 * The shape matters more than the constant — the false-absence load a flat
 * expectation carries grows with N, so the width that answers it has to fall
 * with N.
 */
export function attentionGainFor(n: number): number {
  return 1 / Math.max(1, n);
}

export function createT8(): LayerSpec<T8Input, T8Output> {
  return {
    index: 8,
    consumes: [6],
    process(input, _field, _emit, contribute): T8Output {
      // The width of attention, contributed upward into the field (INV-7).
      // It blends with every other contribution and lands at N+1.
      contribute({ [ATTENTION_GAIN_PARAM]: attentionGainFor(input.others.length) });

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
