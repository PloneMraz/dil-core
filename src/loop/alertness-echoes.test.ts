/**
 * The alertness votes leave out the agent's own echoes.
 *
 * What comes back on the store's own channel — the agent's writes, its memory's
 * answers — returns as it was written and never mismatches; T5's vote is the
 * mismatch of what the region and the Others returned. And the changes that echo
 * the agent's store — a query answered, a write coming back — are SELF_WRITTEN
 * as they should be, but no change the region could have pushed, so T2's vote
 * leaves them out too (dil-arc3, 2026-10-11: counted, they held the field's
 * alertness down however often the region collided).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { runLayer } from "./layer.js";
import { createT2 } from "./layers/t2.js";
import { createT5 } from "./layers/t5.js";
import { STORE_CHANNEL, storeQuery } from "./layers/t3.js";
import { ALERTNESS } from "./field.js";
import { admitHostData } from "../store/tagging-gate.js";
import type { InfoUnit, ModField } from "./types.js";

const field: ModField = { params: {}, t: 0 };
const datum = () => admitHostData({ payload: 1, admittingLayer: 1, open: { domain: "d", a: "1", b: "2" } }, 0);

function unitOn(channel: string, value: unknown): InfoUnit {
  return { content: { infoType: "raw", channel, value }, ref_frame: { boundLayer: 3, ref: `channel:${channel}` }, t: 1 };
}

function alertnessVote(contributions: readonly { params: Record<string, number> }[]): number | undefined {
  return contributions.find((c) => ALERTNESS in c.params)?.params[ALERTNESS];
}

test("T5 does not vote on alertness when only the store returned", () => {
  const run = runLayer(
    createT5(),
    { bound: [{ unit: unitOn(STORE_CHANNEL, "b"), entity_id: "written-0-0" }] },
    field,
    datum(),
  );
  assert.equal(alertnessVote(run.contributions), undefined);
});

test("T5's vote is not diluted by echoes that match", () => {
  const t5 = createT5();
  // First pass: the persistence rule has nothing to repeat, so each mismatches;
  // second pass, the region's value changed (mismatch), the echo repeated (match).
  runLayer(t5, { bound: [{ unit: unitOn("region", 1), entity_id: "frame" }, { unit: unitOn(STORE_CHANNEL, "m"), entity_id: "memo" }] }, field, datum());
  const run = runLayer(t5, { bound: [{ unit: unitOn("region", 2), entity_id: "frame" }, { unit: unitOn(STORE_CHANNEL, "m"), entity_id: "memo" }] }, field, datum());
  assert.equal(alertnessVote(run.contributions), 1, "the region's one return mismatched; the echo is left out");
});

test("T2's alertness vote leaves out the echoes of the agent's store", () => {
  const t2 = createT2({ stabilityThreshold: 1 });
  const query = storeQuery({ domain: "note" });
  const run = runLayer(
    t2,
    {
      env: { content: { present: true, count: 1, sources: ["x"] }, ref_frame: { boundLayer: 1, ref: "activity-environment" }, t: 1 },
      emitted: { action: "move" },
      lateral: [query, { kind: "write", datum: "written-0-0" }],
      changes: [
        { id: "door", value: "opened" }, // the region pushed it
        { id: "note-1", value: query }, // the store answering the agent's query
        { id: "written-0-0", value: { kind: "write", datum: "written-0-0" } }, // its write coming back
      ],
    },
    field,
    datum(),
  );
  const tags = run.output.tagged.map((t) => [t.change.id, t.agency]);
  assert.deepEqual(tags, [["door", "ENV_PUSHED"], ["note-1", "SELF_WRITTEN"], ["written-0-0", "SELF_WRITTEN"]]);
  assert.equal(alertnessVote(run.contributions), 1, "of the changes the region could have pushed, it pushed all");
});
