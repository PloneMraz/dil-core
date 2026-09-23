/**
 * Attention at T7 — the loop stops demanding everything back.
 *
 * Two gates, both additive and defaulted. The presence gate is the region's
 * word: an entity it says is not there is not silent. The attention gate is the
 * field's: an entity the loop is no longer oriented toward is not being waited
 * on. Neither touches registration — that line is §8.2's, and a test here holds
 * it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ATTENTION_GAIN, createT7, type T7Input } from "./t7.js";
import type { InfoUnit, ModField } from "../types.js";

const unit = (v: string): InfoUnit => ({
  content: v,
  ref_frame: { boundLayer: 5, ref: "r" },
  t: 0,
});

const NO_EMIT = () => undefined;
const field = (params: Record<string, number> = {}): ModField => ({ params, t: 0 });

/** One cycle in which `seen` returned and nothing else did. */
function cycleOf(seen: string[], present?: ReadonlySet<string>): T7Input {
  return {
    expectations: seen.map((id) => ({ entity_id: id, predicted: unit(id) })),
    observed: new Set(seen),
    present,
  };
}

const absent = (out: { absences: readonly { entity_id: string }[] }) =>
  out.absences.map((a) => a.entity_id).sort();

// ── the reference behaviour, stated rather than assumed ──

test("with nothing declared, everything ever seen is expected back for ever", () => {
  const t7 = createT7();
  t7.process(cycleOf(["a"]), field(), NO_EMIT);
  t7.process(cycleOf(["b"]), field(), NO_EMIT);
  // `a` has not returned since cycle 1 and is still demanded back.
  assert.deepEqual(absent(t7.process(cycleOf(["b"]), field(), NO_EMIT)), ["a"]);
  assert.deepEqual(absent(t7.process(cycleOf(["b"]), field(), NO_EMIT)), ["a"]);
});

test("flat expectation is why N entities returning one at a time make N-1 absences", () => {
  // The shape measured on a real host: four affordances, one used per cycle.
  const t7 = createT7();
  for (const id of ["a", "b", "c", "d"]) t7.process(cycleOf([id]), field(), NO_EMIT);
  assert.deepEqual(absent(t7.process(cycleOf(["a"]), field(), NO_EMIT)), ["b", "c", "d"]);
});

test("attention thins that flood without silencing absence altogether", () => {
  // Same four-entity round robin, now with a span. Each unused entity sits 1, 2
  // and 3 cycles behind, so a span of 1 leaves one of the three attended: the
  // flood drops from 3 per cycle to 1.
  //
  // A span of 0 would zero it, and that is deliberately NOT what is done here:
  // §8.1 C3 requires that "a missing-InfoUnit is emitted when an expected event
  // fails to occur". A loop that expects nothing can never register absence and
  // would fail C3 by construction. Attention narrows expectation; it must not
  // abolish it.
  const t7 = createT7({ attentionSpan: 1 });
  for (const id of ["a", "b", "c", "d"]) t7.process(cycleOf([id]), field(), NO_EMIT);
  assert.deepEqual(absent(t7.process(cycleOf(["a"]), field(), NO_EMIT)), ["d"]);
});

// ── the region's word ──

test("an entity the region says is not there is not registered absent", () => {
  const t7 = createT7();
  t7.process(cycleOf(["a"]), field(), NO_EMIT);
  const out = t7.process(cycleOf(["b"], new Set(["b"])), field(), NO_EMIT);
  assert.deepEqual(absent(out), []);
});

test("an entity the region says IS there, and which stays silent, is registered absent", () => {
  const t7 = createT7();
  t7.process(cycleOf(["a"]), field(), NO_EMIT);
  const out = t7.process(cycleOf(["b"], new Set(["a", "b"])), field(), NO_EMIT);
  assert.deepEqual(absent(out), ["a"]);
});

// ── the field's word (INV-7) ──

test("out of attention, an entity is no longer demanded back", () => {
  const t7 = createT7({ attentionSpan: 2 });
  t7.process(cycleOf(["a"]), field(), NO_EMIT); // tick 1: a seen
  t7.process(cycleOf(["b"]), field(), NO_EMIT); // tick 2: a is 1 behind
  assert.deepEqual(absent(t7.process(cycleOf(["b"]), field(), NO_EMIT)), ["a"], "2 behind: still attended");
  assert.deepEqual(absent(t7.process(cycleOf(["b"]), field(), NO_EMIT)), [], "3 behind: out of attention");
});

test("a returning entity comes back into attention", () => {
  const t7 = createT7({ attentionSpan: 1 });
  t7.process(cycleOf(["a"]), field(), NO_EMIT);
  t7.process(cycleOf(["b"]), field(), NO_EMIT);
  assert.deepEqual(absent(t7.process(cycleOf(["b"]), field(), NO_EMIT)), [], "a has drifted out");
  t7.process(cycleOf(["a"]), field(), NO_EMIT); // a returns: attended again
  assert.deepEqual(absent(t7.process(cycleOf(["b"]), field(), NO_EMIT)), ["a"]);
});

test("the same accrued state under a different field expects different things", () => {
  // INV-7's stated rationale, made observable: "Same data plus a different field
  // yields different meaning."
  const narrow = createT7({ attentionSpan: 4 });
  const wide = createT7({ attentionSpan: 4 });
  for (const t7 of [narrow, wide]) {
    t7.process(cycleOf(["a"]), field(), NO_EMIT);
    for (let i = 0; i < 3; i++) t7.process(cycleOf(["b"]), field(), NO_EMIT);
  }
  // Identical histories. Only the field differs.
  assert.deepEqual(absent(narrow.process(cycleOf(["b"]), field({ [ATTENTION_GAIN]: 0.5 }), NO_EMIT)), []);
  assert.deepEqual(absent(wide.process(cycleOf(["b"]), field({ [ATTENTION_GAIN]: 2 }), NO_EMIT)), ["a"]);
});

test("the gain is read as background and the layer never writes it", () => {
  const t7 = createT7({ attentionSpan: 1 });
  const f = field({ [ATTENTION_GAIN]: 3 });
  t7.process(cycleOf(["a"]), f, NO_EMIT);
  t7.process(cycleOf(["b"]), f, NO_EMIT);
  assert.deepEqual(f.params, { [ATTENTION_GAIN]: 3 }, "INV-7: down-channel only");
});

// ── the line attention must not cross (§8.2) ──

test("an unattended entity that returns is still registered", () => {
  // §8.2: a loop that "lets the external returns go unregistered" is pure
  // Mode-A. Attention lowers expectation; it must never lower registration.
  const t7 = createT7({ attentionSpan: 1 });
  t7.process(cycleOf(["a"]), field(), NO_EMIT);
  for (let i = 0; i < 5; i++) t7.process(cycleOf(["b"]), field(), NO_EMIT);

  // `a` is long out of attention. It returns.
  const out = t7.process(cycleOf(["a", "b"]), field(), NO_EMIT);
  assert.deepEqual(absent(out), [], "nothing missing");
  // Its return was accrued: it is expected again next cycle.
  assert.deepEqual(absent(t7.process(cycleOf(["b"]), field(), NO_EMIT)), ["a"]);
});

// ── §9 snapshot surface ──

test("attention state survives a snapshot round trip", () => {
  const t7 = createT7({ attentionSpan: 2 });
  t7.process(cycleOf(["a"]), field(), NO_EMIT);
  t7.process(cycleOf(["b"]), field(), NO_EMIT);
  const snap = t7.snapshot();

  const resumed = createT7({ attentionSpan: 2 });
  resumed.restore(snap);
  assert.deepEqual(absent(resumed.process(cycleOf(["b"]), field(), NO_EMIT)), ["a"]);
  assert.deepEqual(absent(resumed.process(cycleOf(["b"]), field(), NO_EMIT)), []);
});

test("a snapshot taken before attention existed resumes still attending", () => {
  // A pre-attention snapshot carries no lastSeen. It restores to 0 alongside a
  // tick of 0, so the entity reads as freshly seen and stays expected. That is
  // the right way round: recovery must not silently NARROW what the loop
  // expects. An entity dropping out of attention has to be earned by cycles
  // passing, not handed out by a restore.
  const resumed = createT7({ attentionSpan: 2 });
  resumed.restore({ expected: [["a", { predicted: unit("a"), seen: 3 }]] });
  assert.deepEqual(absent(resumed.process(cycleOf(["b"]), field(), NO_EMIT)), ["a"]);
  // It then ages out on the ordinary schedule.
  resumed.process(cycleOf(["b"]), field(), NO_EMIT);
  assert.deepEqual(absent(resumed.process(cycleOf(["b"]), field(), NO_EMIT)), []);
});
