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
 *
 * THE FIELD (INV-7). T8 reads `exploration`: how deep it compares Others when it
 * ranks them (T8_COMPARISON) — by resistance at NEUTRAL, the reference; leaning
 * to explore, by resistance and then by the changes each pushed. It closes back
 * into the loop through the field, by voting on the dispositions T4 and T6 read
 * (DIL-en-v7 §7: T8's feedback is "routed by content… GeneralOther to T4,
 * RelValue/SocialEdge to T6"): `trust`, from how evenly resistance is spread
 * across the Others; `exploration`, from how many Other↔Other interactions it
 * met per Other.
 */

import { assertCorrelational } from "../../invariants/guards.js";
import type { LayerSpec } from "../layer.js";
import type { OtherModel, RelValue, SocialEdge } from "../types.js";
import type { IndependenceEvidence } from "./t6.js";
import { EXPLORATION, NEUTRAL, TRUST, axis, castVotes, share } from "../field.js";

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

function pushedOf(other: OtherModel): number {
  const ev = other.independence_evidence as Partial<IndependenceEvidence> | null;
  return typeof ev?.envPushed === "number" ? ev.envPushed : 0;
}

export function createT8(): LayerSpec<T8Input, T8Output> {
  return {
    index: 8,
    consumes: [6],
    process(input, field, _emit, contribute): T8Output {
      // How deep the Others are compared, read off the field (T8_COMPARISON).
      const deep = axis(field, EXPLORATION) > NEUTRAL;
      // RelValue exists only when N ≥ 2.
      let relValues: RelValue[] = [];
      if (input.others.length >= 2) {
        const ranked = [...input.others].sort(
          (a, b) =>
            resistancesOf(b) - resistancesOf(a) || (deep ? pushedOf(b) - pushedOf(a) : 0),
        );
        relValues = ranked.map((other, i) => ({
          entity_id: other.entity_id,
          relative_rank: i + 1,
          comparison_basis: deep ? "resistance+envPushed" : "resistance",
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
      // loop, not into a sink"). The meaning-channel cannot carry relValues and
      // socialEdges back down — INV-3 forbids it — but the field can, from N+1:
      // T8 votes on the dispositions the layers below it read. Resistance spread
      // evenly across the Others is Others comparable as sources (trust);
      // resistance held by one is one source standing out against the rest.
      // Others meeting each other is more of the region to explore.
      const n = input.others.length;
      const resistances = input.others.map(resistancesOf);
      const total = resistances.reduce((a, b) => a + b, 0);
      castVotes(contribute, {
        [TRUST]: n >= 2 && total > 0 ? 1 - Math.max(...resistances) / total : undefined,
        [EXPLORATION]: n >= 2 ? share(socialEdges.length, n) : undefined,
      });

      return { relValues, socialEdges };
    },
  };
}
