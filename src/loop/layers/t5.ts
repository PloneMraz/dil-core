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

import type { ContributeFn, LayerSpec, Snapshottable } from "../layer.js";
import type { Expectation, InfoUnit, PredErr } from "../types.js";
import type { BoundInfo } from "./t4.js";
import { storeQuery, type Description } from "./t3.js";
import type { OpenTags } from "../../store/tags.js";
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
  /** What the rule wrote this cycle, in order; the driver takes each into `[data]` (v0.3.3). */
  readonly writes?: readonly WriteRequest[];
  /** The actions the rule pushed to the region as tests this cycle, in order (§6.4). */
  readonly tests?: readonly unknown[];
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
 *
 * It also receives `contribute`, the up-channel into the field (INV-7), bound to
 * T5. **Why a rule needs it.** Where a host puts a model, the model is the only
 * thing that reads the situation closely enough to say anything about it, and a
 * rule is not a layer: without this it can form an expectation and can report
 * nothing, so its reading of its own situation is computed and thrown away.
 * Measured on a live host, the field held two constants and three quantities
 * that went flat by cycle 8 — it had almost no context to compose from, and the
 * one thing that knew any was on the far side of this seam.
 *
 * A rule that has nothing to report omits the parameter.
 *
 * And it receives `ask`, the store query, issued from T5. **Why a rule needs
 * it.** The rule is where the thinking is, and thinking that meets a problem goes
 * to memory for what bears on it: the rule chooses what to read, and the store is
 * not poured into it. §6.4 gives the means — "emission is a lateral capability
 * any layer MAY invoke: when a layer's own work requires pushing to the region —
 * to obtain what it lacks" — and names the query among the emissions a layer
 * already presupposes. Before this, only T3 could ask, and only about what had
 * just arrived; the part of the loop that knew what it was missing could not.
 *
 * `ask` takes a cue — the open-tag pairs to match (§9, tag F) — and can emit
 * nothing but a query. Reading memory is the rule's; acting on the region is
 * not, and an expectation never becomes a choice. The query is an emission like
 * any other: register ↔, one activity record naming T5 as its issuing layer, and
 * its answer arrives at T1 next cycle and runs every layer, so what the rule
 * read is in the trace. Nothing counts or limits how often a rule asks.
 *
 * And it receives `write`, the one way the rule's product enters the store
 * (v0.3.3). **Why a rule needs it.** Where the thinking is a model, what it
 * makes — a program predicting the region, say — is data, and data that is not
 * in `[data]` cannot be recalled, snapshotted, or read back by a third party.
 * `write` without a `datumId` writes a datum anew: it enters at `nascent`,
 * bearing this cycle's mark. With a `datumId` it revises a datum already held:
 * the content changes, the provenance does not, and a `revision` line is
 * recorded. Either way the datum arrives at T1 next cycle, is classified
 * SELF_WRITTEN at T2, and runs every layer. The driver does the admitting and
 * the recording; the rule only says what to write.
 *
 * And it receives `test`, the emission §6.4 names as T5's own: "an action that
 * pushes to the region to see whether the return matches the Expectation just
 * built". **Why a rule needs it.** Where the thinking is a model, working out the
 * region is not only predicting what comes back but deciding what to try next,
 * so that the return can meet the expectation. The rule thinks; it does not act:
 * `test` records the action as an emission from T5 (register ↔, one activity
 * record naming T5), and the action reaches the region only if the host has a
 * body to carry it out — dil-core has none, and records it. It is readable by T2
 * next cycle, like every lateral emission. `CycleResult.tests` hands the cycle's
 * tests to the host.
 *
 * It returns the expected unit, or the expected unit with the held data it is
 * (`Expecting`, v0.3.5). **Why a rule needs to say that.** When an expectation
 * mismatches, every datum that met the mismatch is scarred (§9): the return,
 * and the datum the expectation is. A rule that returns a unit it took from its
 * window — persistence does — needs to say nothing, since the driver knows which
 * datum that unit came from. A rule that makes its expectation anew — by running
 * a program it wrote, say — is the only thing that knows which datum it ran, so
 * it names it: `heldBy`, units or datum ids, `[]` for nothing held.
 */
export type PredictRule = (
  entityId: string,
  window: readonly InfoUnit[],
  observed: InfoUnit,
  contribute: ContributeFn,
  ask: AskFn,
  write: WriteFn,
  test?: TestFn,
) => InfoUnit | Expecting;

/** An action pushed to the region to test an expectation (§6.4). It emits nothing else. */
export type TestFn = (action: unknown) => void;

/** The emission a test is recorded as: an action for the region, from T5. */
export interface RegionTest {
  readonly kind: "test";
  readonly action: unknown;
}

export function regionTest(action: unknown): RegionTest {
  return { kind: "test", action };
}

/** An expectation, with the held data it is (v0.3.5 §6.1). */
export interface Expecting {
  readonly predicted: InfoUnit;
  readonly heldBy: readonly (InfoUnit | string)[];
}

function isExpecting(out: InfoUnit | Expecting): out is Expecting {
  return (out as Expecting).heldBy !== undefined && (out as Expecting).predicted !== undefined;
}

/** A store query from the rule, by cue (§6.4, §9). It emits nothing else. */
export type AskFn = (cue: Description) => void;

/** What the rule asks to be written: a datum anew, or a revision of one it holds. */
export interface WriteRequest {
  /** The datum to revise; absent to write one anew. */
  readonly datumId?: string;
  readonly payload: unknown;
  /** Required for a datum written anew; for a revision, replaces its open tags when given. */
  readonly open?: OpenTags;
  /**
   * What it was built from (v0.3.4 §9): the observations the rule drew on — units
   * from its window or the one in front of it — and data it recalled, by id. The
   * driver records the ids, never the content. An empty list says nothing held
   * in the store went into it.
   */
  readonly builtFrom: readonly (InfoUnit | string)[];
}

/** Writing from the rule into `[data]`, through the driver (v0.3.3). */
export type WriteFn = (request: WriteRequest) => void;

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
    process(input, _field, emit, contribute): T5Output {
      // The rule's road outward: a query to the store, issued from T5.
      const ask: AskFn = (cue) => emit(storeQuery(cue));
      // And its road into the store: what it writes, handed to the driver.
      const writes: WriteRequest[] = [];
      const write: WriteFn = (request) => {
        writes.push(request);
      };
      // And its road to the region: a test, recorded from T5 (§6.4).
      const tests: unknown[] = [];
      const test: TestFn = (action) => {
        tests.push(action);
        emit(regionTest(action));
      };
      const results = input.bound.map((b): T5Result => {
        const id = b.entity_id;
        const observed = b.unit;
        const window = windows.get(id) ?? [];
        const count = counts.get(id) ?? 0;

        // The declared update law. Whatever the rule, what leaves here is an
        // expectation and never a choice.
        // The rule may report upward into the field; the contribution is bound
        // to T5, since it is T5's declared rule that made it. It may also ask
        // the store; the query is traced to T5 for the same reason.
        const out = predict(id, window, observed, contribute, ask, write, test);
        const predicted = isExpecting(out) ? out.predicted : out;
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
          // Named by the rule, or — for a rule that returned a unit it took from
          // its window — that unit, which the driver resolves to its datum.
          held_by: isExpecting(out) ? out.heldBy.slice() : [out],
          held_by_declared: isExpecting(out),
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
      return {
        results,
        ...(writes.length > 0 ? { writes } : {}),
        ...(tests.length > 0 ? { tests } : {}),
      };
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
