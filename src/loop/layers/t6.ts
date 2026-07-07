/**
 * T6 — Other-Model Synthesis (protocol §6.3, §8.4; stage 4d).
 *
 * Builds an OtherModel per entity. It lives fully ONLY under Mode-B: the
 * independence evidence — resistance the agent could not author (mismatches) and
 * env-pushed changes — accrues only when there is real external resistance.
 * Under Mode-A (self-confirmation, nothing pushes back) the evidence stays zero
 * and the model degenerates. State accrues per entity (INV-5).
 */

import type { LayerSpec, Snapshottable } from "../layer.js";
import type { OtherModel } from "../types.js";
import type { T5Result } from "./t5.js";

/** Concrete shape of OtherModel.independence_evidence (shared with T8). */
export interface IndependenceEvidence {
  /** Mismatches the agent met but could not author (resistance). */
  readonly resistances: number;
  /** Changes classified ENV_PUSHED for this entity (from T2). */
  readonly envPushed: number;
}

export interface T6Input {
  readonly results: readonly T5Result[];
  /** Entities whose change this cycle was ENV_PUSHED (from T2's agency tags). */
  readonly envPushed?: ReadonlySet<string>;
}

export interface T6Output {
  readonly others: readonly OtherModel[];
}

interface EntityState {
  resistances: number;
  envPushed: number;
  observations: number;
}

export function createT6(): LayerSpec<T6Input, T6Output> & Snapshottable {
  const state = new Map<string, EntityState>();

  return {
    index: 6,
    // §9 snapshot surface (recovery-only restore; see Snapshottable).
    snapshot: () => ({ entities: [...state.entries()] }),
    restore(snap: unknown): void {
      const s = snap as { entities: [string, EntityState][] };
      state.clear();
      for (const [k, v] of s.entities) state.set(k, v);
    },
    // T6 consumes T5's results AND T2's agency tags (the env-pushed evidence);
    // under multi-stream it reads both from the meaning-channel itself, rather
    // than having the T2 digest smuggled in by the driver.
    consumes: [2, 5],
    process(input): T6Output {
      const others = input.results.map((result): OtherModel => {
        const id = result.entity_id;
        const st = state.get(id) ?? { resistances: 0, envPushed: 0, observations: 0 };
        st.observations += 1;
        if (result.predErr.delta > 0) st.resistances += 1; // resistance met
        if (input.envPushed?.has(id)) st.envPushed += 1;
        state.set(id, st);

        const evidence: IndependenceEvidence = {
          resistances: st.resistances,
          envPushed: st.envPushed,
        };
        return {
          entity_id: id,
          context_map: {
            lastContent: result.predErr.observed?.content ?? null,
            observations: st.observations,
          },
          independence_evidence: evidence,
        };
      });
      return { others };
    },
  };
}
