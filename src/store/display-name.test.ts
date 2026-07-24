/**
 * Smoke test — displayName, the derived tag→name projection.
 *
 * Asserts the name is a faithful, lossless-by-key projection of the tags, and
 * (crucially) that it is computed FROM tags rather than being where tags live:
 * the same datum re-stamped to a new layer yields a new name without any
 * rename of stored state.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { admitHostData } from "./tagging-gate.js";
import { stampLayer, toRunning, toScar } from "./data-store.js";
import { recordScar, type ContextAnchor } from "./resist-event.js";
import { displayName, eventDisplayName } from "./display-name.js";
import { CONTEXT_ANCHOR_DEPTH } from "./decisions.js";

const TS = Date.UTC(2026, 5, 30); // 2026-06-30 (month is 0-based)
const open = { domain: "financial", currency: "VND", object: "revenue" };

test("displayName renders fixed layer then keyed open tags, domain first", () => {
  let d = admitHostData({ payload: 1, admittingLayer: 1, open }, TS);
  d = toRunning(d, 2);
  d = stampLayer(d, 6);
  assert.equal(
    displayName(d),
    "[20260630]_[00:00:00]_[c2]_[running]_[T6]_[domain:financial]_[currency:VND]_[object:revenue]",
  );
});

test("a prior renders its null cycle-mark as c-", () => {
  const d = admitHostData({ payload: 1, admittingLayer: 1, open }, TS);
  assert.ok(displayName(d).includes("_[c-]_[prior]_[T1]_"));
});

test("open keys are preserved in the name (filterable, not lossy positions)", () => {
  const d = admitHostData({ payload: 1, admittingLayer: 1, open }, TS);
  // every key:value is present with its key
  assert.ok(displayName(d).includes("[domain:financial]"));
  assert.ok(displayName(d).includes("[currency:VND]"));
  assert.ok(displayName(d).includes("[object:revenue]"));
});

test("the name is derived: re-stamping changes the name without renaming state", () => {
  let d = admitHostData({ payload: 1, admittingLayer: 1, open }, TS);
  d = toRunning(d, 2);
  const atT3 = displayName(stampLayer(d, 3));
  const atT7 = displayName(stampLayer(d, 7));
  assert.ok(atT3.includes("_[T3]_"));
  assert.ok(atT7.includes("_[T7]_"));
  assert.notEqual(atT3, atT7);
});

test("eventDisplayName uses the scar's tags plus the mismatch kind", () => {
  let d = admitHostData({ payload: 1, admittingLayer: 1, open }, TS);
  d = toRunning(d, 2);
  d = stampLayer(d, 6);
  d = toScar(d, true);
  const anchor: ContextAnchor = {
    depth: CONTEXT_ANCHOR_DEPTH,
    cycle: 2,
    fieldState: {},
  };
  const rec = recordScar(
    d,
    { source_id: "s", expected: "a", received: "b", mismatch_kind: "value-mismatch", t: 1 },
    anchor,
  );
  assert.equal(
    eventDisplayName(rec),
    "[20260630]_[00:00:00]_[c2]_[scar]_[T6]_[domain:financial]_[currency:VND]_[object:revenue]_[value-mismatch]",
  );
});
