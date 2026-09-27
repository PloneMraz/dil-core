/**
 * The mind — the thinking, seated at the loop's seams (CONTEXT.md §5a).
 *
 * The host acts on the region and carries what returns inward; DIL is the
 * mechanism the data runs by; the mind is where it is thought about. It sits at
 * T5's rule, the seam §6 leaves for the update law, and through it the mind
 * receives every arrival and has the loop's four roads outward: the expectation
 * it returns, `ask` (a question to its own memory), `write` (a datum into the
 * store), `test` (a command pushed to the region, §6.4). The field reaches it as
 * it reaches every layer (INV-7).
 *
 * WHAT IT DOES, whatever its model:
 *
 *   - **Expects** — from which situation it is (the entity, what it returned
 *     before), never from the answer: the model is not shown what came back
 *     until it has said what it expects (INV-8).
 *   - **Looks** — the model is shown what came back, and whether the
 *     expectation held; a model that learns from every return says what to
 *     write of it.
 *   - **Thinks** on an expectation that failed, as many times a cycle as its
 *     alertness allows (MIND_THOUGHTS_PER_CYCLE at NEUTRAL): the model revises
 *     itself, says what to write and what to ask its memory. What memory
 *     answers reaches the model the next time it thinks — asked for, never
 *     poured in.
 *   - **Commands** — what the model proposes, pushed as T5's test. The mind does
 *     not score its command (INV-8); the region's return does.
 *
 * Every write records what it was built from (v0.3.4). A unit names its datum
 * only where the host admitted it as one: a write built from a return the host
 * kept out is refused by the driver, as it should be.
 */

import type { InfoUnit } from "../loop/types.js";
import type { Expecting, PredictRule, WriteRequest } from "../loop/layers/t5.js";
import { STORE_CHANNEL } from "../loop/layers/t3.js";
import { ALERTNESS, axis, rising, shiftedCount } from "../loop/field.js";
import type { OpenTags } from "../store/tags.js";
import { MIND_THOUGHTS_PER_CYCLE } from "./decisions.js";
import type { Arrival, Context, Model, Proposal, Situation, Write } from "./model.js";

/** The open tags every datum the mind writes carries, under the model's own. */
export const MIND_TAGS: OpenTags = { domain: "mind", source: "mind" };

/** What the mind did, for a run's report (the trace itself is `[event]`). */
export interface MindReport {
  readonly expectations: number;
  readonly held: number;
  readonly thoughts: number;
  readonly writes: number;
  readonly asks: number;
  readonly commands: readonly { readonly cycle: number; readonly proposal: Proposal }[];
}

export interface Mind {
  /** The mind at T5's seam: one rule, every arrival. */
  readonly rule: PredictRule;
  report(): MindReport;
}

function valueOf(unit: InfoUnit): unknown {
  const c = unit.content as { value?: unknown } | null;
  return c !== null && typeof c === "object" && "value" in c ? c.value : unit.content;
}

function withValue(unit: InfoUnit, value: unknown): InfoUnit {
  const c = unit.content;
  const content =
    c !== null && typeof c === "object" && "value" in (c as object) ? { ...(c as object), value } : value;
  return { ...unit, content };
}

function channelOf(unit: InfoUnit): unknown {
  const c = unit.content as { channel?: unknown } | null;
  return c !== null && typeof c === "object" ? c.channel : undefined;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function createMind(model: Model): Mind {
  let expectations = 0;
  let held = 0;
  let thoughts = 0;
  let writes = 0;
  let asks = 0;
  const commands: { cycle: number; proposal: Proposal }[] = [];
  // What memory answered, waiting for the next thought; and the cycle the mind
  // last thought in, with how often.
  let recalled: Context["recalled"][number][] = [];
  let thoughtCycle = -1;
  let thoughtsThisCycle = 0;

  const rule: PredictRule = (entityId, window, observed, _contribute, ask, write, test, field) => {
    const cycle = field?.t ?? 0;
    const standing = window.length > 0 ? window[window.length - 1]! : observed;

    // What memory answered: held for the next thought, and expected as it is.
    if (channelOf(observed) === STORE_CHANNEL) {
      recalled.push({ id: entityId, unit: observed, value: valueOf(observed) });
      return standing;
    }

    const writeAll = (list: readonly Write[] | undefined, kind: string) => {
      for (const w of list ?? []) {
        const request: WriteRequest = {
          payload: w.payload,
          open: { ...MIND_TAGS, kind, ...(w.tags ?? {}) },
          builtFrom: w.builtFrom,
        };
        write(request);
        writes += 1;
      }
    };

    // 1. Expect, from the situation alone (INV-8).
    const situation: Situation = {
      entityId,
      window: window.map(valueOf),
      windowUnits: window,
      cycle,
      field,
    };
    const expected = model.expect(situation);
    expectations += 1;
    const byModel = expected.value !== undefined;
    const predicted = byModel ? withValue(observed, expected.value) : standing;
    const out: InfoUnit | Expecting =
      byModel && expected.heldBy !== undefined
        ? { predicted, heldBy: expected.heldBy }
        : predicted;

    // 2. Look.
    const value = valueOf(observed);
    const hit = same(valueOf(predicted), value);
    if (hit) held += 1;
    const arrival: Arrival = { ...situation, value, unit: observed, held: hit, expected: valueOf(predicted) };
    writeAll(model.observe?.(arrival), "learned");

    // 3. Think, on an expectation that failed — as often a cycle as alertness allows.
    if (cycle !== thoughtCycle) {
      thoughtCycle = cycle;
      thoughtsThisCycle = 0;
    }
    const context: Context = { ...arrival, on: hit ? "arrival" : "mismatch", recalled };
    const allowed = shiftedCount(MIND_THOUGHTS_PER_CYCLE, rising(axis(field, ALERTNESS)));
    if (!hit && model.think !== undefined && thoughtsThisCycle < allowed) {
      thoughtsThisCycle += 1;
      thoughts += 1;
      const thinking = model.think(context);
      recalled = [];
      if (thinking !== null) {
        writeAll(thinking.writes, "thought");
        for (const cue of thinking.asks ?? []) {
          ask(cue);
          asks += 1;
        }
      }
    }

    // 4. Command: what the model proposes, pushed as T5's test (§6.4).
    const proposal = model.propose?.(context) ?? null;
    if (proposal !== null && test !== undefined) {
      test(proposal.action);
      commands.push({ cycle, proposal });
    }
    return out;
  };

  return {
    rule,
    report: () => ({ expectations, held, thoughts, writes, asks, commands: [...commands] }),
  };
}

