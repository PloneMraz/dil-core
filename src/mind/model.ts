/**
 * What a model is to the mind: the part of the mind that computes.
 *
 * Three parts, not two (CONTEXT.md §5a): the host acts on the region and carries
 * what returns inward; the mind thinks — computes, learns, enriches, expects,
 * builds forward, constructs behaviour, commands; DIL is the mechanism the data
 * runs by between them. The model is the mind's engine, and replaceable: its
 * weights are the parameter block that "may be frozen at run time" (DIL-en-v7
 * §4), not the self. Another model changes how well the mind thinks, not what
 * it is.
 *
 * The model writes nothing and asks nothing itself, and acts on nothing: it
 * says what to expect, what to write, what to ask, what to do next, and the
 * mind does it through the loop's seams — so every write, question and command
 * is the mind's, and in `[event]`.
 */

import type { InfoUnit, ModField } from "../loop/types.js";
import type { Description } from "../loop/layers/t3.js";
import type { OpenTags } from "../store/tags.js";

/** What is being predicted: WHICH situation, never its answer (INV-8). */
export interface Situation {
  readonly entityId: string;
  /** What this entity returned before, oldest first — the values, and the units they came in. */
  readonly window: readonly unknown[];
  readonly windowUnits: readonly InfoUnit[];
  /** The cycle, as the field carries it. */
  readonly cycle: number;
  readonly field: ModField | undefined;
}

/** What the model expects to come back. */
export interface Expected {
  /** The value expected; undefined: the model makes no expectation, the standing one holds. */
  readonly value?: unknown;
  /** Which data the expectation is (`heldBy`, v0.3.5): units or datum ids; [] for none. */
  readonly heldBy?: readonly (InfoUnit | string)[];
}

/** What came back, now that it has. */
export interface Arrival extends Situation {
  readonly value: unknown;
  readonly unit: InfoUnit;
  /** Whether the expectation held. */
  readonly held: boolean;
  readonly expected: unknown;
}

/** A datum the model asks the mind to write, anew. */
export interface Write {
  readonly payload: unknown;
  /** Open tags, over the mind's own (`domain: mind`, `source: mind`, `kind`). */
  readonly tags?: OpenTags;
  /** What it was built from: units the mind handed it, or datum ids (v0.3.4). */
  readonly builtFrom: readonly (InfoUnit | string)[];
}

/** What the mind hands the model to think or propose from. */
export interface Context extends Arrival {
  /** Why it is being asked: an expectation that failed, or an arrival to act on. */
  readonly on: "mismatch" | "arrival";
  /** What memory answered to what was asked, since it last thought: datum id → payload. */
  readonly recalled: readonly { readonly id: string; readonly unit: InfoUnit; readonly value: unknown }[];
}

/** What came of one act of thinking. */
export interface Thinking {
  readonly writes?: readonly Write[];
  /** Questions to memory, each a cue by the store's open tags (§9, tag F). */
  readonly asks?: readonly Description[];
}

/** What the model proposes the host do next. */
export interface Proposal {
  readonly action: unknown;
  readonly why?: string;
}

export interface Model {
  /** What will come back for this situation, from what it has learned (INV-8: not from the answer). */
  expect(situation: Situation): Expected;
  /** What came back — for a model that learns from every return. */
  observe?(arrival: Arrival): readonly Write[];
  /** Revise itself on an expectation that failed. */
  think?(context: Context): Thinking | null;
  /** What to do next; null: nothing to command. */
  propose?(context: Context): Proposal | null;
}

/**
 * The model with nothing learned and nothing to say: the standing expectation
 * holds — an entity returns what it returned last. A mind thinking with it
 * behaves exactly as T5's reference law, `persistence`.
 */
export const standingModel: Model = {
  expect: () => ({}),
};
