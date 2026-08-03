/**
 * Smoke test — the absorption measure (§8.3): real brake vs deceleration.
 *
 * A source that keeps producing prediction error at high recurrence is a REAL
 * brake (new in kind still arrives); one whose error has gone to 0 is absorbed
 * (memorized → deceleration only). The signal fires when EVERY sufficiently-probed
 * source has been absorbed. Absence readings feed the measure too.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { measureAbsorption } from "./absorption.js";
import { recordExpectation, recordResistanceReading } from "../store/resist-event.js";

test("a source still erring at high recurrence is 'resisting' — a real brake (§8.3)", () => {
  const recs = [
    recordExpectation("c0", 0, "weather", "weather", 0, 0, 1, 1),
    recordExpectation("c3", 3, "weather", "weather", 1, 3, 1, 2), // recurrence 3, delta still 1
  ];
  const r = measureAbsorption(recs, 3);
  assert.equal(r.perSource.get("weather"), "resisting");
  assert.equal(r.signal, null);
});

test("a source whose error →0 at high recurrence is 'absorbed'; all-absorbed fires the signal", () => {
  const recs = [
    recordExpectation("c3", 3, "weather", "weather", 1, 3, 0, 1), // recurrence 3, delta 0
    recordExpectation("c4", 4, "weather", "weather", 1, 4, 0, 2),
  ];
  const r = measureAbsorption(recs, 3);
  assert.equal(r.perSource.get("weather"), "absorbed");
  assert.match(r.signal ?? "", /deceleration only/);
});

test("one still-resisting source keeps the signal null even if another is absorbed", () => {
  const recs = [
    recordExpectation("c3", 3, "weather", "weather", 1, 3, 0, 1), // absorbed
    recordExpectation("c3", 3, "market", "market", 1, 3, 1, 2),   // resisting
  ];
  const r = measureAbsorption(recs, 3);
  assert.equal(r.perSource.get("weather"), "absorbed");
  assert.equal(r.perSource.get("market"), "resisting");
  assert.equal(r.signal, null); // a real brake remains
});

test("an under-probed source is 'insufficient' and raises no signal (no false alarm)", () => {
  const recs = [recordExpectation("c0", 0, "weather", "weather", 0, 0, 1, 1)];
  const r = measureAbsorption(recs, 3);
  assert.equal(r.perSource.get("weather"), "insufficient");
  assert.equal(r.signal, null);
});

test("absence resistance-readings feed absorption too — grouped by the resisting subject (§8)", () => {
  const recs = [
    recordResistanceReading("c3", 3, "region", "market", "absence", 3, 1, "-", 1), // still absent at recurrence 3
  ];
  const r = measureAbsorption(recs, 3);
  assert.equal(r.perSource.get("market"), "resisting"); // the absent source still resists
});
