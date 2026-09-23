/**
 * The resistance-retrieval channel (§9, §10).
 *
 * Asserts the store finally answers, that it answers with an EXPECTATION and
 * nothing else, and — the load-bearing one — that a recollection never reaches
 * the observation slot, where it would let an agent inflate its own confidence
 * by re-reading its own log.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { admitHostData } from "../store/tagging-gate.js";
import { toRunning, toScar } from "../store/data-store.js";
import { recordScar, type ContextAnchor } from "../store/resist-event.js";
import { createEventLog } from "../store/event-log.js";
import { CONTEXT_ANCHOR_DEPTH } from "../store/decisions.js";
import { createLogRecollection, recollecting } from "./recollection.js";
import { createT5, persistence } from "./layers/t5.js";
import type { InfoUnit } from "./types.js";

const TS_AT = Date.UTC(2026, 5, 30);
const open = { domain: "game", phase: "loop", source: "region" };
const anchor: ContextAnchor = { depth: CONTEXT_ANCHOR_DEPTH, cycle: 1, fieldState: {} };

/** An InfoUnit whose content names a situation and an outcome. */
function unit(where: string, outcome: string, t = 1): InfoUnit {
  return { content: { where, outcome }, ref_frame: { boundLayer: 3, ref: "c" }, t };
}

const situationKey = (u: InfoUnit): string =>
  String((u.content as { where?: unknown }).where ?? "");

function appendScar(log: ReturnType<typeof createEventLog>, received: unknown, t: number) {
  let d = admitHostData({ payload: "cycle", admittingLayer: 1, open }, TS_AT);
  d = toRunning(d, t);
  log.append(
    recordScar(
      toScar(d, true),
      { source_id: "door", expected: null, received, mismatch_kind: "value-mismatch", t },
      anchor,
    ),
  );
  return log;
}

function logWithScar(received: unknown) {
  return appendScar(createEventLog(), received, 1);
}

const EMPTY_FIELD = { params: {}, t: 0 };
const NO_EMIT = () => undefined;

// ── the store answers ──

test("a scar recorded for an entity comes back as an expectation", () => {
  const rec = createLogRecollection(logWithScar({ where: "hall", outcome: "locked" }), {
    key: situationKey,
  });
  assert.deepEqual(rec.recall("door", unit("hall", "anything"))?.content, {
    where: "hall",
    outcome: "locked",
  });
});

test("the recalled unit carries a reference frame, so it is an InfoUnit (INV-4)", () => {
  const recalled = createLogRecollection(logWithScar({ where: "hall", outcome: "locked" }), {
    key: situationKey,
  }).recall("door", unit("hall", "x"));
  assert.equal(recalled?.ref_frame.ref, "recollection:door");
  assert.ok(recalled!.ref_frame.boundLayer <= 5, "INV-3: bound layer must be <= the consumer");
});

test("the record is silent about a situation it has never met", () => {
  const rec = createLogRecollection(logWithScar({ where: "hall", outcome: "locked" }), {
    key: situationKey,
  });
  assert.equal(rec.recall("door", unit("cellar", "x")), null);
});

test("the record is silent about an entity it has never met", () => {
  const rec = createLogRecollection(logWithScar({ where: "hall", outcome: "locked" }), {
    key: situationKey,
  });
  assert.equal(rec.recall("window", unit("hall", "x")), null);
});

test("the most recent record about a situation is the one that answers", () => {
  const log = logWithScar({ where: "hall", outcome: "locked" });
  appendScar(log, { where: "hall", outcome: "open" }, 2);
  const recalled = createLogRecollection(log, { key: situationKey }).recall(
    "door",
    unit("hall", "x"),
  );
  assert.deepEqual(recalled?.content, { where: "hall", outcome: "open" });
});

test("an absence scar is not recallable, holding no return to recall", () => {
  const rec = createLogRecollection(logWithScar(null), { key: situationKey });
  assert.equal(rec.recall("door", unit("hall", "x")), null);
});

test("the scan back through one entity's records is bounded", () => {
  const log = createEventLog();
  for (let i = 0; i < 30; i++) {
    appendScar(log, { where: i === 0 ? "hall" : "elsewhere", outcome: "locked" }, i);
  }
  // The only `hall` record is the oldest, out of reach of a scan of 5.
  assert.equal(
    createLogRecollection(log, { key: situationKey, maxScan: 5 }).recall("door", unit("hall", "x")),
    null,
  );
  assert.ok(
    createLogRecollection(log, { key: situationKey }).recall("door", unit("hall", "x")),
    "and in reach of the default scan",
  );
});

// ── it is an expectation, and only an expectation ──

test("the rule falls back when the record is silent", () => {
  const rule = recollecting(
    createLogRecollection(logWithScar({ where: "hall", outcome: "locked" }), { key: situationKey }),
  );
  const predicted = rule("door", [unit("cellar", "dark")], unit("cellar", "x"));
  assert.deepEqual(predicted.content, { where: "cellar", outcome: "dark" });
});

test("the record outranks persistence about a situation it holds", () => {
  const rule = recollecting(
    createLogRecollection(logWithScar({ where: "hall", outcome: "locked" }), { key: situationKey }),
  );
  const predicted = rule("door", [unit("hall", "open")], unit("hall", "x"));
  assert.deepEqual(predicted.content, { where: "hall", outcome: "locked" });
});

test("the record enters the expectation slot and never the observation slot", () => {
  // §13.4 reads climbing confidence-with-recurrence as the signature separating
  // an accruing self from a reloading impostor. If a recollection counted as an
  // observation, an agent would raise its own confidence by re-reading its own
  // log, becoming the impostor that signature exists to catch.
  const t5 = createT5({
    predict: recollecting(
      createLogRecollection(logWithScar({ where: "hall", outcome: "locked" }), {
        key: situationKey,
      }),
    ),
    sufficientRecurrence: 4,
  });

  const out = t5.process(
    { bound: [{ unit: unit("hall", "open"), entity_id: "door" }] },
    EMPTY_FIELD,
    NO_EMIT,
  );

  const r = out.results[0]!;
  // The record said `locked`; the region said `open`. That is the mismatch.
  assert.deepEqual(r.expectation.predicted.content, { where: "hall", outcome: "locked" });
  assert.deepEqual(r.predErr.observed?.content, { where: "hall", outcome: "open" });
  assert.equal(r.predErr.delta, 1, "the region contradicted the record");

  const snap = t5.snapshot() as { counts: [string, number][] };
  assert.deepEqual(snap.counts, [["door", 1]], "one world-contact accrued, not two");
});

test("read, expectation, the region answers, mismatch, scar", () => {
  // The whole chain: the record yields an expectation, the expectation repeats,
  // and the region decides whether it holds.
  const t5 = createT5({
    predict: recollecting(
      createLogRecollection(logWithScar({ where: "hall", outcome: "locked" }), {
        key: situationKey,
      }),
    ),
  });

  // The region agrees with the record: no mismatch.
  const agreeing = t5.process(
    { bound: [{ unit: unit("hall", "locked"), entity_id: "door" }] },
    EMPTY_FIELD,
    NO_EMIT,
  );
  assert.equal(agreeing.results[0]!.predErr.delta, 0);

  // The region contradicts it: a mismatch, which the driver turns into a scar.
  const contradicting = t5.process(
    { bound: [{ unit: unit("hall", "open"), entity_id: "door" }] },
    EMPTY_FIELD,
    NO_EMIT,
  );
  assert.equal(contradicting.results[0]!.predErr.delta, 1);
});

test("with no rule declared the reference behaviour is unchanged", () => {
  const observed = unit("hall", "open");
  const out = createT5().process(
    { bound: [{ unit: observed, entity_id: "door" }] },
    EMPTY_FIELD,
    NO_EMIT,
  );
  // A fresh entity predicts itself, exactly as persistence always did.
  assert.equal(out.results[0]!.predErr.delta, 0);
  assert.deepEqual(
    persistence("door", [], observed).content,
    out.results[0]!.expectation.predicted.content,
  );
});
