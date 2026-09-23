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
 *
 * ATTENTION (INV-7), and why it belongs here first. Without it, expectation is
 * FLAT: every entity ever seen is expected back every cycle, for ever. With one
 * entity that is invisible; with N entities of which one returns per cycle it is
 * N−1 false absences per cycle. Measured on a real host: 444 of 481 scars were
 * absences of that kind. The loop could not tell "fell silent" from "not being
 * attended to", because it had no notion of attending.
 *
 * The field supplies that notion. INV-7 already reaches every layer as
 * background — "the same datum under a different field integrates, appraises and
 * responds differently" — and this is the first layer to draw on it: the field's
 * `attentionGain` scales how long an entity stays expected after it was last
 * seen. Same accrued state, different field, different set of things demanded
 * back.
 *
 * WHAT ATTENTION MUST NOT DO. §8.2 defines pure Mode-A as a loop where "returns
 * do arrive" but the agent "lets the external returns go unregistered", and §8.4
 * adds that "a return becomes a datum only if it is registered". An attention
 * gate that suppressed returns would BE that failure — the mechanism of drift,
 * installed deliberately. So this gate touches only what is DEMANDED BACK. Every
 * return still arrives through T3, is still bound at T4, still meets its
 * expectation at T5, and is still registered. Attention lowers expectation; it
 * never lowers registration. Nothing is lost when an entity stops being
 * attended, so nothing needs accounting for.
 */

import type { LayerSpec, Snapshottable } from "../layer.js";
import type { InfoUnit, ModField } from "../types.js";

export interface T7Input {
  /** This cycle's expectations (entity → predicted), used to update memory. */
  readonly expectations: readonly { readonly entity_id: string; readonly predicted: InfoUnit }[];
  /** Entities that actually returned this cycle. */
  readonly observed: ReadonlySet<string>;
  /**
   * Entities the region reports PRESENT this cycle — able to return if they are
   * going to. An absence is registered only against these.
   *
   * Silence presupposes the chance to speak: an entity the region itself says is
   * not there is not silent, it is simply not there. `undefined` means the host
   * does not report presence, and the original behaviour holds exactly.
   *
   * This is host ingest, like T1's and T3's — not a meaning-channel read, so
   * INV-3 is not in play.
   */
  readonly present?: ReadonlySet<string>;
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
  /**
   * How many cycles an entity stays expected after it was last seen
   * (DECIDE@IMPL). Scaled by the field's `attentionGain`.
   *
   * Defaults to Infinity — attend to everything, for ever — so a host that
   * declares no span behaves exactly as the reference always did.
   */
  readonly attentionSpan?: number;
}

/** The field parameter that scales the attention span (INV-7, down-channel). */
export const ATTENTION_GAIN = "attentionGain";

/** How many expected entities stayed silent this cycle (INV-7, up-channel). */
export const SILENCE = "silence";

/**
 * How wide attention is, read off the field (DECIDE@IMPL, tunable and NOT
 * derived).
 *
 * ATTENTION IS A COMPOSITION, NOT A FORMULA IN ONE LAYER. An earlier version had
 * T6 compute `1/N` and contribute the answer, which made attention a lone
 * layer's constant. It is not: it is what the whole field holds. This reads the
 * facts each layer reported from its own vantage and composes them —
 *
 *   `otherCount`  (T6, accrued)  how many Others the loop is holding
 *   `strangeness` (T4, context)  the share of arrivals that bound to no entity
 *
 * — so that attention narrows as the loop holds more, and widens again when what
 * arrives stops being attributable. A strange situation earns a longer look; a
 * crowded familiar one does not. Both inputs are facts from context and
 * environment rather than tuning knobs, which is the whole point.
 *
 * The composition itself is declared and tunable. With an empty field it returns
 * 1, so a host that reports nothing keeps the reference behaviour exactly.
 */
export function attentionWidth(params: Record<string, number>): number {
  const others = params[OTHER_COUNT_READ] ?? 0;
  const strangeness = params[STRANGENESS_READ] ?? 0;
  return (1 + strangeness) / Math.max(1, others);
}

// Read-only names for the facts other layers report. Duplicated as string
// constants rather than imported, so T7 takes no meaning-channel dependency on
// T4 or T6 (INV-3): the field is the down-channel and carries no such tie.
const OTHER_COUNT_READ = "otherCount";
const STRANGENESS_READ = "strangeness";

interface ExpectState {
  predicted: InfoUnit;
  seen: number;
  /** The tick this entity was last seen at — its recency, and its salience. */
  lastSeen: number;
}

export function createT7(opts: T7Options = {}): LayerSpec<T7Input, T7Output> & Snapshottable {
  const minSeen = opts.minObservationsToExpect ?? 1;
  const baseSpan = opts.attentionSpan ?? Number.POSITIVE_INFINITY;
  const expected = new Map<string, ExpectState>();
  // T7 runs once per cycle, so its own call count IS a cycle clock. Accrued,
  // never loaded (INV-5).
  let tick = 0;

  return {
    index: 7,
    consumes: [5],
    // §9 snapshot surface (recovery-only restore; see Snapshottable).
    snapshot: () => ({ expected: [...expected.entries()], tick }),
    restore(state: unknown): void {
      // A snapshot taken before attention existed carries no lastSeen. It
      // restores to 0 alongside a tick of 0, so the entity reads as freshly seen
      // and stays expected: recovery must not silently NARROW what the loop
      // expects. Dropping out of attention is earned by cycles passing, never
      // handed out by a restore.
      const s = state as {
        expected: [string, Omit<ExpectState, "lastSeen"> & { lastSeen?: number }][];
        tick?: number;
      };
      expected.clear();
      for (const [k, v] of s.expected) expected.set(k, { ...v, lastSeen: v.lastSeen ?? 0 });
      tick = s.tick ?? 0;
    },
    process(input, field: ModField, _emit, contribute): T7Output {
      tick += 1;
      // Accrue this cycle's expectations into memory.
      for (const e of input.expectations) {
        const st = expected.get(e.entity_id) ?? { predicted: e.predicted, seen: 0, lastSeen: tick };
        st.predicted = e.predicted;
        st.seen += 1;
        st.lastSeen = tick;
        expected.set(e.entity_id, st);
      }

      // The attention span in force this cycle: the declared span under the
      // field's gain (INV-7, read as read-only background; T7 never reaches up
      // into the field).
      // The span in force this cycle: the declared span, narrowed or widened by
      // what the field holds, and finally scaled by any explicit gain a host has
      // set. INV-7 down-channel — read as background, never written.
      const params = field?.params ?? {};
      const span = baseSpan * attentionWidth(params) * (params[ATTENTION_GAIN] ?? 1);
      // Register absence for expected entities that did not return, naming which
      // entity fell silent and how many times it had been expected (recurrence),
      // so the absent source's resistance is readable per-source in the trace.
      const absences: AbsenceReading[] = [];
      for (const [id, st] of expected) {
        if (st.seen < minSeen || input.observed.has(id)) continue;
        // The region says it is not there: not silent, just absent from the
        // region. Silence presupposes the chance to speak.
        if (input.present !== undefined && !input.present.has(id)) continue;
        // Out of attention: the loop is no longer demanding this one back, so
        // its not-returning is not a mismatch. The return itself, if it comes,
        // is registered as it always was.
        if (tick - st.lastSeen > span) continue;

        absences.push({
          entity_id: id,
          recurrence: st.seen,
          observed: null, // the missing InfoUnit
          predicted: st.predicted,
          delta: 1,
          signed: "-", // absence is negative
        });
      }
      // A FACT T7 can see: how much of what the loop was waiting for did not
      // arrive. Reported, not interpreted.
      contribute({ [SILENCE]: absences.length });
      return { absences };
    },
    // INV-4: the predicted unit of each absence is an InfoUnit.
    infoUnits: (out) => out.absences.map((a) => a.predicted),
  };
}
