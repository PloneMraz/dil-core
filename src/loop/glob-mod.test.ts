/**
 * Smoke test — Stage 4b, GLOB-MOD (protocol §5 INV-7).
 *
 * Pins the four load-bearing properties: within-cycle immutability, the N+1
 * effect, blend-not-last-write, and no-runaway by construction (convexity).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createGlobMod, GlobModError } from "./glob-mod.js";
import { InvariantViolation } from "../invariants/violation.js";

test("contribute does not change the active field within the cycle (N+1 only)", () => {
  const gm = createGlobMod({ gain: 0.5 }, 0);
  gm.contribute(5, { gain: 0.9 }, 1);
  // still the cycle-0 field; the contribution is pending
  assert.equal(gm.current().params.gain, 0.5);
  assert.equal(gm.cycle(), 0);
});

test("advance applies the blend at the next cycle", () => {
  const gm = createGlobMod({ gain: 0.5 }, 0);
  gm.contribute(5, { gain: 0.9 }, 1);
  const next = gm.advance(1);
  assert.equal(next.params.gain, 0.9); // single contributor → its value
  assert.equal(gm.cycle(), 1);
  assert.equal(next.t, 1);
});

test("blend is a weighted average, not last-write-wins", () => {
  const gm = createGlobMod({ gain: 0 }, 0);
  // two layers compete on the same key; order must not decide
  gm.contribute(3, { gain: 0.2 }, 1);
  gm.contribute(7, { gain: 0.8 }, 1);
  const next = gm.advance(1);
  // equal weights → mean 0.5, not the last writer's 0.8
  assert.equal(next.params.gain, 0.5);
});

test("weighted average respects unequal weights", () => {
  const gm = createGlobMod({}, 0);
  gm.contribute(3, { g: 0 }, 3);
  gm.contribute(7, { g: 1 }, 1);
  const next = gm.advance(1);
  // (3*0 + 1*1) / (3+1) = 0.25
  assert.equal(next.params.g, 0.25);
});

test("a key no layer contributes carries over unchanged", () => {
  const gm = createGlobMod({ kept: 0.42, moved: 0.1 }, 0);
  gm.contribute(5, { moved: 0.9 }, 1);
  const next = gm.advance(1);
  assert.equal(next.params.kept, 0.42); // untouched → carried over
  assert.equal(next.params.moved, 0.9);
});

test("the active field cannot be mutated within its cycle", () => {
  const gm = createGlobMod({ gain: 0.5 }, 0);
  assert.throws(() => {
    // @ts-expect-error — the active field's params are frozen
    gm.current().params.gain = 9;
  }, TypeError);
});

test("advance halts (INV-7) if the effect is not strictly later than N", () => {
  const gm = createGlobMod({ gain: 0.5 }, 2);
  gm.contribute(5, { gain: 0.9 }, 1);
  // effect cycle 2 == contribution cycle 2 → within-cycle, forbidden
  assert.throws(() => gm.advance(2), InvariantViolation);
});

test("negative contribution weight is rejected (convexity)", () => {
  const gm = createGlobMod({}, 0);
  assert.throws(() => gm.contribute(5, { g: 1 }, -1), GlobModError);
});

test("no runaway: the blended value stays within the range of contributions", () => {
  let gm = createGlobMod({ g: 0.5 }, 0);
  // drive many cycles; every contribution is within [0.2, 0.8]
  for (let c = 0; c < 50; c++) {
    gm.contribute(3, { g: 0.2 }, Math.random());
    gm.contribute(7, { g: 0.8 }, Math.random());
    gm.advance(c + 1);
    const g = gm.current().params.g;
    assert.ok(g >= 0.2 && g <= 0.8, `field ran out of bounds: ${g}`);
  }
});
