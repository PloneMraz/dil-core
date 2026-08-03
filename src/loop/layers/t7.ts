/**
 * T7 — Absence Registration (protocol §6.3; stage 4d).
 *
 * Emits a signed PredErr for registered absence (ABS-INV): when an entity that
 * was expected fails to return this cycle, its absence is registered as a
 * NEGATIVE PredErr (observed = null, signed = "-"). A single silence against a
 * background of returns is a valid mismatch (protocol §4); unbroken silence is a
 * void field, handled by the precondition gate, not here.
 *
 * T7 accrues which entities are expected to recur (INV-5): an entity seen at
 * least `minObservationsToExpect` times is expected next cycle.
 */

import type { LayerSpec, Snapshottable } from "../layer.js";
import type { InfoUnit } from "../types.js";

export interface T7Input {
  /** This cycle's expectations (entity → predicted), used to update memory. */
  readonly expectations: readonly { readonly entity_id: string; readonly predicted: InfoUnit }[];
  /** Entities that actually returned this cycle. */
  readonly observed: ReadonlySet<string>;
}

/**
 * A registered absence — a signed-negative PredErr that additionally names WHICH
 * entity fell silent and how many times it had been expected (`recurrence`). It is
 * still a PredErr (assignable everywhere one is used), enriched so a third party
 * can read the absent source's resistance per-source in the trace (the source's
 * "resistance reading" for absence, §8, cycle driver).
 */
export interface AbsenceReading {
  readonly entity_id: string;
  /** How many times this entity had been expected (T7's `seen`). */
  readonly recurrence: number;
  readonly observed: null;
  readonly predicted: InfoUnit;
  readonly delta: number;
  readonly signed: "-";
}

export interface T7Output {
  readonly absences: readonly AbsenceReading[];
}

export interface T7Options {
  /** Times an entity must be seen before its absence is registered (default 1). */
  readonly minObservationsToExpect?: number;
}

interface ExpectState {
  predicted: InfoUnit;
  seen: number;
}

export function createT7(opts: T7Options = {}): LayerSpec<T7Input, T7Output> & Snapshottable {
  const minSeen = opts.minObservationsToExpect ?? 1;
  const expected = new Map<string, ExpectState>();

  return {
    index: 7,
    consumes: [5],
    // §9 snapshot surface (recovery-only restore; see Snapshottable).
    snapshot: () => ({ expected: [...expected.entries()] }),
    restore(state: unknown): void {
      const s = state as { expected: [string, ExpectState][] };
      expected.clear();
      for (const [k, v] of s.expected) expected.set(k, v);
    },
    process(input): T7Output {
      // Accrue this cycle's expectations into memory.
      for (const e of input.expectations) {
        const st = expected.get(e.entity_id) ?? { predicted: e.predicted, seen: 0 };
        st.predicted = e.predicted;
        st.seen += 1;
        expected.set(e.entity_id, st);
      }
      // Register absence for expected entities that did not return, naming which
      // entity fell silent and how many times it had been expected (recurrence),
      // so the absent source's resistance is readable per-source in the trace.
      const absences: AbsenceReading[] = [];
      for (const [id, st] of expected) {
        if (st.seen >= minSeen && !input.observed.has(id)) {
          absences.push({
            entity_id: id,
            recurrence: st.seen,
            observed: null, // the missing InfoUnit
            predicted: st.predicted,
            delta: 1,
            signed: "-", // absence is negative
          });
        }
      }
      return { absences };
    },
    // INV-4: the predicted unit of each absence is an InfoUnit.
    infoUnits: (out) => out.absences.map((a) => a.predicted),
  };
}
