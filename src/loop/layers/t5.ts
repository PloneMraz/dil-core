/**
 * T5 — Temporal Expectation (protocol §6.3; stage 4d).
 *
 * Builds an Expectation per entity and emits a signed PredErr. This is where
 * resistance (E2) becomes information: a mismatch between what was predicted and
 * what the region returned enters as a signed PredErr — the precursor of a
 * ResistEvent (the cycle driver decides whether it holds into a scar, 4e).
 *
 * Update law (DECIDE@IMPL, declared): persistence — predict the most recent
 * observation for the entity. This satisfies C2: against a stable entity the
 * prediction matches and PredErr falls to zero with repetition. State accrues
 * per entity across cycles (INV-5); the window is bounded by BASELINE_WINDOW and
 * confidence ramps over SUFFICIENT_RECURRENCE.
 */

import type { LayerSpec } from "../layer.js";
import type { Expectation, InfoUnit, PredErr } from "../types.js";
import type { BoundInfo } from "./t4.js";
import { BASELINE_WINDOW, SUFFICIENT_RECURRENCE } from "../decisions.js";

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
}

function contentEqual(a: InfoUnit, b: InfoUnit): boolean {
  return JSON.stringify(a.content) === JSON.stringify(b.content);
}

export function createT5(opts: T5Options = {}): LayerSpec<T5Input, T5Output> {
  const windowSize = opts.baselineWindow ?? BASELINE_WINDOW;
  const recurrence = opts.sufficientRecurrence ?? SUFFICIENT_RECURRENCE;

  // Accruing per-entity state (INV-5): accumulated, never reloaded.
  const windows = new Map<string, InfoUnit[]>();
  const counts = new Map<string, number>();

  return {
    index: 5,
    consumes: [4],
    process(input): T5Output {
      const results = input.bound.map((b): T5Result => {
        const id = b.entity_id;
        const observed = b.unit;
        const window = windows.get(id) ?? [];
        const count = counts.get(id) ?? 0;

        // Persistence: predict the most recent observation (or self if fresh).
        const predicted = window.length > 0 ? window[window.length - 1]! : observed;
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
          built_from: window.slice(),
        };

        // Accrue this observation into the bounded window.
        const nextWindow = [...window, observed];
        while (nextWindow.length > windowSize) nextWindow.shift();
        windows.set(id, nextWindow);
        counts.set(id, count + 1);

        return { entity_id: id, expectation, predErr };
      });
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
