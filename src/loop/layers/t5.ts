/**
 * T5 — Temporal Expectation (protocol §6.3; stage 4d).
 *
 * Builds an Expectation per entity and emits a signed PredErr. This is where
 * resistance (E2) becomes information: a mismatch between what was predicted and
 * what the region returned enters as a signed PredErr — the precursor of a
 * ResistEvent (the cycle driver decides whether it holds into a scar, 4e).
 *
 * Update law (DECIDE@IMPL, declared): persistence by default — predict the most
 * recent observation for the entity — and host-declarable through `PredictRule`.
 * This satisfies C2: against a stable entity the prediction matches and PredErr
 * falls to zero with repetition. State accrues per entity across cycles (INV-5);
 * the window is bounded by BASELINE_WINDOW and confidence ramps over
 * SUFFICIENT_RECURRENCE.
 *
 * WHY THE RULE IS A SEAM. §9 makes the store the seat of experience — "the self
 * accrues from scars" — and §10 requires a private store to carry the
 * resistance-retrieval channel. Until now nothing in the loop could read the
 * store at all, so those clauses were satisfied nowhere: scars were written and
 * never returned. This seam is the retrieval channel. A rule may consult the
 * `[event]` log and answer "what did the region give, last time, here"; see
 * `store/recollection.ts`.
 *
 * WHICH SLOT THE RECORD ENTERS, AND WHY IT MATTERS. The record supplies the
 * EXPECTATION; the region supplies the OBSERVATION. It must not be the other way
 * round. `recurrence` counts observations, and §13.4 reads a climbing
 * confidence-with-recurrence as the signature that separates an accruing self
 * from "a reloading impostor [that] cannot make either climb". Let recollections
 * in through the observation slot and an agent inflates its own confidence by
 * re-reading its own log — becoming precisely the impostor that signature exists
 * to catch. Through the expectation slot nothing of the sort is possible: only
 * what the region returned ever enters the window.
 */

import type { LayerSpec, Snapshottable } from "../layer.js";
import type { Expectation, InfoUnit, PredErr } from "../types.js";
import type { BoundInfo } from "./t4.js";
import { BASELINE_WINDOW, SUFFICIENT_RECURRENCE } from "../decisions.js";

/** Mean prediction error over this cycle's entities (INV-7, up-channel). */
export const SURPRISE = "surprise";

export interface T5Result {
  readonly entity_id: string;
  readonly expectation: Expectation;
  readonly predErr: PredErr;
}

export interface T5Input {
  readonly bound: readonly BoundInfo[];
}

export interface T5Output {
  readonly results: readonly T5Result[];
}

export interface T5Options {
  readonly baselineWindow?: number;
  readonly sufficientRecurrence?: number;
  /** The declared update law. Defaults to `persistence`. */
  readonly predict?: PredictRule;
}

/**
 * Builds the expectation for one entity (DECIDE@IMPL, host-declared).
 *
 * It receives the entity, the accrued window for that entity, and this cycle's
 * observation. It MUST NOT read the observation's content as the answer: that is
 * what it is being asked to predict, and using it would make the prediction
 * error self-scoring (INV-8). It may read the observation to identify WHICH
 * situation is being predicted — that is the question, not the answer.
 */
export type PredictRule = (
  entityId: string,
  window: readonly InfoUnit[],
  observed: InfoUnit,
) => InfoUnit;

/**
 * The reference update law: predict the most recent observation, or the
 * observation itself when the entity is fresh.
 *
 * Stays the default, so a host that declares no rule behaves exactly as before.
 */
export const persistence: PredictRule = (_entityId, window, observed) =>
  window.length > 0 ? window[window.length - 1]! : observed;

function contentEqual(a: InfoUnit, b: InfoUnit): boolean {
  return JSON.stringify(a.content) === JSON.stringify(b.content);
}

export function createT5(opts: T5Options = {}): LayerSpec<T5Input, T5Output> & Snapshottable {
  const windowSize = opts.baselineWindow ?? BASELINE_WINDOW;
  const recurrence = opts.sufficientRecurrence ?? SUFFICIENT_RECURRENCE;
  const predict = opts.predict ?? persistence;

  // Accruing per-entity state (INV-5): accumulated, never reloaded.
  const windows = new Map<string, InfoUnit[]>();
  const counts = new Map<string, number>();

  return {
    index: 5,
    consumes: [4],
    // §9 snapshot surface (recovery-only restore; see Snapshottable).
    snapshot: () => ({ windows: [...windows.entries()], counts: [...counts.entries()] }),
    restore(state: unknown): void {
      const s = state as { windows: [string, InfoUnit[]][]; counts: [string, number][] };
      windows.clear();
      for (const [k, v] of s.windows) windows.set(k, v);
      counts.clear();
      for (const [k, v] of s.counts) counts.set(k, v);
    },
    process(input, _field, _emit, contribute): T5Output {
      const results = input.bound.map((b): T5Result => {
        const id = b.entity_id;
        const observed = b.unit;
        const window = windows.get(id) ?? [];
        const count = counts.get(id) ?? 0;

        // The declared update law. Whatever the rule, what leaves here is an
        // expectation and never a choice.
        const predicted = predict(id, window, observed);
        const confidence = Math.min(1, count / recurrence);

        const matched = contentEqual(observed, predicted);
        const predErr: PredErr = {
          observed,
          predicted,
          delta: matched ? 0 : 1,
          // present observation differing from prediction is a positive surprise;
          // absence (a negative) is registered at T7.
          signed: "+",
        };
        const expectation: Expectation = {
          predicted,
          confidence,
          recurrence: count, // observations accrued so far (pre this one); drives confidence
          built_from: window.slice(),
        };

        // Accrue this observation into the bounded window.
        const nextWindow = [...window, observed];
        while (nextWindow.length > windowSize) nextWindow.shift();
        windows.set(id, nextWindow);
        counts.set(id, count + 1);

        return { entity_id: id, expectation, predErr };
      });
      // A FACT T5 can see: how far the region fell from expectation, right now.
      // Reported as it is; what follows from it is not T5's to say.
      const surprise =
        results.length > 0
          ? results.reduce((sum, r) => sum + r.predErr.delta, 0) / results.length
          : 0;
      contribute({ [SURPRISE]: surprise });
      return { results };
    },
    // INV-4: predicted and observed are InfoUnits leaving the layer.
    infoUnits: (out) =>
      out.results.flatMap((r) =>
        r.predErr.observed
          ? [r.expectation.predicted, r.predErr.observed]
          : [r.expectation.predicted],
      ),
  };
}
