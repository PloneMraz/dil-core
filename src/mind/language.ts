/**
 * A language model as the mind's engine — local or hosted, reached at an
 * endpoint (endpoint.ts).
 *
 * It is asked only when the mind thinks: an expectation failed. It is shown the
 * entity, what it returned before, what was expected, what came back, what
 * memory answered to what was asked, and the field the loop reads by — bounded,
 * never the whole history (INV-5). It answers in one JSON object: what it now
 * expects of that entity, why, what to ask its memory, and what to command.
 * What it now expects is what it expects until it thinks again; with nothing
 * said, the standing expectation holds.
 *
 * Every answer is kept whole as the mind's datum (`kind: thought`), built from
 * what it was shown — the answer that did not parse too, with why. A request
 * that failed changes nothing and is said so in the next prompt.
 *
 * The prompt names no environment: what the region is, the model reads from
 * what comes back. OPEN: its expectation is not yet tied to the datum it wrote
 * (`heldBy`), so a failed expectation scars the return and not the thought.
 */

import { AXES, axis } from "../loop/field.js";
import type { InfoUnit } from "../loop/types.js";
import type { Description } from "../loop/layers/t3.js";
import { chat as sendChat, type ChatFn, type ChatMessage, type ModelEndpoint } from "./endpoint.js";
import type { Context, Model, Proposal, Thinking } from "./model.js";

export interface LanguageModelOptions {
  readonly endpoint: ModelEndpoint;
  /** How a request is sent; the child-process transport by default. */
  readonly chat?: ChatFn;
}

export interface LanguageModel extends Model {
  /** What went wrong with an answer or a request, for a run's report. */
  notes(): readonly string[];
}

export const SYSTEM_PROMPT = [
  "You are the thinking part of an agent that lives in a loop. Each cycle, entities in the region it acts on return values, and it expects what each will return.",
  "An expectation just failed. From what you are shown, say what you now expect, and what to do.",
  "Reply with one JSON object and nothing else:",
  '{"expect": <the value you now expect this entity to return next, any JSON; null to expect what it returned last>,',
  ' "note": <a short reason>,',
  ' "ask": <a list of cues to your own memory, each an object of tag: value pairs over the store\'s open tags (domain, kind, source, ...), or []>,',
  ' "command": <an action for the region, any JSON, or null>}',
  "The field is the disposition the loop reads by, each axis from 0 to 1: trust (how readily a source is trusted), alertness (to mismatch), exploration (rather than consolidating).",
].join("\n");

interface Answer {
  readonly expect?: unknown;
  readonly note?: unknown;
  readonly ask?: unknown;
  readonly command?: unknown;
}

/** The first JSON object in a text, fences and all; undefined if there is none. */
export function parseAnswer(text: string): Answer | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const v: unknown = JSON.parse(text.slice(start, end + 1));
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Answer) : undefined;
  } catch {
    return undefined;
  }
}

function cuesOf(ask: unknown): Description[] {
  if (!Array.isArray(ask)) return [];
  return ask.filter(
    (c): c is Description =>
      c !== null && typeof c === "object" && !Array.isArray(c) && Object.values(c).every((v) => typeof v === "string"),
  );
}

export function languageModel(opts: LanguageModelOptions): LanguageModel {
  const send = opts.chat ?? sendChat;
  const beliefs = new Map<string, unknown>();
  const notes: string[] = [];
  let pending: Proposal | null = null;
  let lastProblem: string | undefined;

  const prompt = (c: Context): ChatMessage[] => {
    const shown = {
      entity: c.entityId,
      returned_before: c.window,
      you_expected: c.expected,
      came_back: c.value,
      memory_answered: c.recalled.map((r) => ({ id: r.id, value: r.value })),
      field: Object.fromEntries(AXES.map((a) => [a, axis(c.field, a)])),
      ...(lastProblem !== undefined ? { your_last_answer: lastProblem } : {}),
    };
    return [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(shown) },
    ];
  };

  return {
    notes: () => [...notes],

    expect: (s) => (beliefs.has(s.entityId) ? { value: beliefs.get(s.entityId) } : {}),

    think(c: Context): Thinking | null {
      const messages = prompt(c);
      const result = send(opts.endpoint, messages);
      if (!result.ok) {
        notes.push(`request failed: ${result.error}`);
        lastProblem = "the request for it failed; nothing changed";
        return null;
      }
      const answer = parseAnswer(result.text);
      const shownFrom: (InfoUnit | string)[] = [...c.windowUnits, c.unit, ...c.recalled.map((r) => r.unit)];
      if (answer === undefined) {
        notes.push("an answer that was not one JSON object");
        lastProblem = "it was not one JSON object, and nothing was taken from it";
        return { writes: [{ payload: { text: result.text, taken: false }, builtFrom: shownFrom }] };
      }
      lastProblem = undefined;
      if (answer.expect === null || answer.expect === undefined) beliefs.delete(c.entityId);
      else beliefs.set(c.entityId, answer.expect);
      pending =
        answer.command === null || answer.command === undefined
          ? null
          : { action: answer.command, ...(typeof answer.note === "string" ? { why: answer.note } : {}) };
      return {
        writes: [{ payload: { text: result.text, taken: true }, builtFrom: shownFrom }],
        asks: cuesOf(answer.ask),
      };
    },

    propose(): Proposal | null {
      const p = pending;
      pending = null;
      return p;
    },
  };
}
