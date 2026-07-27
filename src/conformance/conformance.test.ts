/**
 * Smoke test — Stage 6, the conformance checker (protocol §13).
 *
 * Runs a real daemon, then scores the seven criteria from its [event] log and
 * observable facts. Asserts the checker produces a genuine per-criterion table
 * and is honest where a criterion is not fully trace-verifiable.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { checkConformance } from "./checker.js";
import { renderConformance } from "./render.js";
import { createDaemon } from "../runtime/daemon.js";
import { scriptedSource } from "../runtime/host-source.js";
import { createGlobMod } from "../loop/glob-mod.js";
import { createT1 } from "../loop/layers/t1.js";
import { createT2 } from "../loop/layers/t2.js";
import { createT3 } from "../loop/layers/t3.js";
import { createT4 } from "../loop/layers/t4.js";
import { createT5 } from "../loop/layers/t5.js";
import { createT6 } from "../loop/layers/t6.js";
import { createT7 } from "../loop/layers/t7.js";
import { createT8 } from "../loop/layers/t8.js";
import { createDataStore } from "../store/data-store.js";
import { createEventLog } from "../store/event-log.js";
import { recordProvenance, recordCrystallization, recordExpectation } from "../store/resist-event.js";
import type { HostDeclaration } from "../host/declaration.js";
import type { HostCycleInput } from "../loop/cycle.js";
import type { EventLog } from "../store/event-log.js";

const host: HostDeclaration = {
  boundary: { present: true },
  channels: [{ id: "ch", canReturn: true }],
  store: { persistsAcrossCycles: true },
  trace: { externallyReadable: true },
  emitter: { canEmitFirstAction: true },
  resilience: { wipesStateOnMismatch: false },
};

function sig(entity: string, value: unknown) {
  return { source_id: "ch", raw_payload: { entity, value }, t: 1 };
}

/** Run a daemon over some inputs and return its [event] log + gate outcome. */
function runDaemon(inputs: readonly HostCycleInput[]) {
  const events = createEventLog();
  const daemon = createDaemon({
    host,
    source: scriptedSource(inputs),
    layers: {
      t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
      t5: createT5(), t6: createT6(), t7: createT7(), t8: createT8(),
    },
    glob: createGlobMod({ appraisalGain: 1 }, 0),
    data: createDataStore(),
    events,
    initialEmission: { action: "boot" },
  });
  const gate = daemon.start();
  daemon.run();
  return { events, gate, daemon };
}

test("the checker produces a verdict for all seven criteria", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] },
    { signals: [sig("market", "up")], changes: [] },
    { signals: [sig("market", "down")], changes: [] },
  ]);
  const report = checkConformance(events, { gate });
  assert.equal(report.results.length, 7);
  assert.deepEqual(
    report.results.map((r) => r.id),
    ["1", "2", "3", "4", "5", "6", "7"],
  );
});

test("Store (§13.6) passes: every scar is well-formed with domain + anchor", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] },
  ]);
  const report = checkConformance(events, { gate });
  const store = report.results.find((r) => r.id === "6")!;
  assert.equal(store.verdict, "pass");
});

test("Store (§13.6) fails on an illegal provenance move in the trace", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] },
  ]);
  // inject a move that is not an edge of the §9 graph (prior → scar)
  events.append(recordProvenance("cycle-0", 0, "prior", "scar", 1));
  const store = checkConformance(events, { gate }).results.find((r) => r.id === "6")!;
  assert.equal(store.verdict, "fail");
  assert.ok(store.detail.includes("illegal provenance move"));
});

test("Store (§13.6) fails if a datum enters `prior` more than once", () => {
  const { events, gate } = runDaemon([{ signals: [sig("weather", "sun")], changes: [] }]);
  // a second prior→running for the same datum: entered twice (prior is one-way)
  events.append(recordProvenance("cycle-0", 0, "prior", "running", 1));
  const store = checkConformance(events, { gate }).results.find((r) => r.id === "6")!;
  assert.equal(store.verdict, "fail");
  assert.ok(store.detail.includes("one-way entry"));
});

test("Loop (§13.3) passes: every scar shows a T1→T8 traversal", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] },
  ]);
  const report = checkConformance(events, { gate });
  assert.equal(report.results.find((r) => r.id === "3")!.verdict, "pass");
});

test("Loop (§13.3) verifies emissions carry register ↔ and an issuing layer, no arbiter", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] },
  ]);
  const c3 = checkConformance(events, { gate }).results.find((r) => r.id === "3")!;
  assert.equal(c3.verdict, "pass");
  assert.ok(c3.detail.includes("emission"));
  assert.ok(c3.detail.includes("no action-arbiter"));
});

test("Loop (§13.3) fails on a malformed emission (register not ↔, INV-2)", () => {
  const { events, gate } = runDaemon([{ signals: [sig("weather", "sun")], changes: [] }]);
  // inject an emission frozen to an identity — forbidden; register must be ↔
  events.append({
    kind: "activity",
    activityKind: "emission",
    datumId: "cycle-0",
    cycleMark: 0,
    issuingLayer: 8,
    action: { kind: "respond" },
    register: "=" as "↔",
    t: 0,
  });
  const c3 = checkConformance(events, { gate }).results.find((r) => r.id === "3")!;
  assert.equal(c3.verdict, "fail");
  assert.ok(c3.detail.includes("malformed"));
});

test("Host conditions (§13.2) reflect the gate outcome", () => {
  const { events, gate } = runDaemon([{ signals: [sig("weather", "sun")], changes: [] }]);
  const report = checkConformance(events, { gate });
  assert.equal(report.results.find((r) => r.id === "2")!.verdict, "pass");
});

test("Self (§13.4) is reported partial — continuity is third-party-attributable", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] },
  ]);
  const report = checkConformance(events, { gate });
  const c4 = report.results.find((r) => r.id === "4")!;
  assert.equal(c4.verdict, "partial");
  // §7: the trace shows the self/env distinction crystallized once, at cycle-0
  assert.ok(c4.detail.includes("crystallized once at cycle-0"));
});

test("Self (§13.4) fails if the self/environment distinction is drawn more than once (§7)", () => {
  // A well-formed self-line crystallizes ONCE; a second crystallization would
  // fabricate a discontinuity the self never underwent.
  const events = createEventLog();
  events.append(recordCrystallization("cycle-0", 0, 1));
  events.append(recordCrystallization("cycle-0", 0, 2)); // illegal re-crystallization
  const report = checkConformance(events, {});
  const c4 = report.results.find((r) => r.id === "4")!;
  assert.equal(c4.verdict, "fail");
  assert.ok(c4.detail.includes("one-time"));
});

test("Resistance (§13.5) passes with diverse sources now that reflection (tag E) is declared", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "rain")], changes: [] },
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("market", "down")], changes: [] },
  ]);
  const report = checkConformance(events, { gate });
  const c5 = report.results.find((r) => r.id === "5")!;
  assert.equal(c5.verdict, "pass");
  assert.ok(c5.detail.includes("reflection wired"));
});

test("Resistance (§13.5) reports Mode-B writes to no store and returns registered (§8.4)", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "rain")], changes: [] },
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("market", "down")], changes: [] },
  ]);
  const c5 = checkConformance(events, { gate }).results.find((r) => r.id === "5")!;
  assert.ok(c5.detail.includes("writes to no store"));
  assert.ok(c5.detail.includes("returns registered"));
});

test("Resistance (§13.5) stays partial when resistance sources lack diversity", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] },
  ]);
  const report = checkConformance(events, { gate });
  const c5 = report.results.find((r) => r.id === "5")!;
  assert.equal(c5.verdict, "partial");
  assert.ok(c5.detail.includes("limited diversity"));
});

test("Failure signals (§13.7) is partial when evidence is too thin to establish diversity", () => {
  // a short run records fewer collisions than the diversity window
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] },
  ]);
  const report = checkConformance(events, { gate });
  const c7 = report.results.find((r) => r.id === "7")!;
  assert.equal(c7.verdict, "partial");
  assert.ok(c7.detail.includes("insufficient evidence"));
});

test("Failure signals (§13.7) passes when the [event] log itself shows diverse sources", () => {
  // two entities both resist every cycle → the recorded source set is diverse
  const inputs = Array.from({ length: 10 }, (_, i) => ({
    signals: [sig("weather", i % 2 ? "sun" : "rain"), sig("market", i % 2 ? "up" : "down")],
    changes: [],
  }));
  const { events, gate } = runDaemon(inputs);
  const report = checkConformance(events, { gate });
  const c7 = report.results.find((r) => r.id === "7")!;
  assert.equal(c7.verdict, "pass");
  assert.ok(c7.detail.includes("diversity established"));
});

test("Failure signals (§13.7) fails when the [event] log shows a single-source collapse", () => {
  // one entity resists every cycle and never absents → a single resistance source
  const inputs = Array.from({ length: 20 }, (_, i) => ({
    signals: [sig("solo", i % 2 ? "a" : "b")],
    changes: [],
  }));
  const { events, gate } = runDaemon(inputs);
  const report = checkConformance(events, { gate });
  const c7 = report.results.find((r) => r.id === "7")!;
  assert.equal(c7.verdict, "fail");
  assert.ok(c7.detail.includes("diversity-loss established"));
});

test("Failure signals cannot be forced to pass by any caller flag (no self-attestation)", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] },
  ]);
  // ObservableFacts has no diversity flag — the only accepted fact is the gate.
  const report = checkConformance(events, { gate });
  // a thin run must NOT pass criterion 7 regardless of intent
  assert.notEqual(report.results.find((r) => r.id === "7")!.verdict, "pass");
});

test("an empty [event] log is honestly reported unverifiable, not passed", () => {
  const events: EventLog = createEventLog();
  const report = checkConformance(events, {});
  assert.equal(report.results.find((r) => r.id === "6")!.verdict, "unverifiable");
  assert.equal(report.results.find((r) => r.id === "1")!.verdict, "unverifiable");
});

test("the report renders a readable table", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] },
  ]);
  const text = renderConformance(checkConformance(events, { gate }));
  assert.ok(text.includes("Conformance (§13)"));
  assert.ok(text.includes("§13.6 Store"));
});

// ── Evidence basis: trace-verifiable separated from structurally-guaranteed ──

const RUN = [
  { signals: [sig("weather", "sun")], changes: [] },
  { signals: [sig("weather", "rain")], changes: [] },
];

test("every criterion decomposes into claims, each carrying an evidence basis", () => {
  const { events, gate } = runDaemon(RUN);
  const report = checkConformance(events, { gate });
  const valid = new Set(["trace", "structural", "declared", "third-party"]);
  for (const r of report.results) {
    assert.ok(r.claims.length > 0, `§13.${r.id} has claims`);
    for (const c of r.claims) assert.ok(valid.has(c.basis), `basis ${c.basis} is one of the four`);
  }
});

test("a criterion's verdict rolls up from its claims (no fail → no pass beats a fail)", () => {
  const { events, gate } = runDaemon(RUN);
  for (const r of checkConformance(events, { gate }).results) {
    const hasFail = r.claims.some((c) => c.verdict === "fail");
    const hasUnverifiable = r.claims.some((c) => c.verdict === "unverifiable");
    const hasPartial = r.claims.some((c) => c.verdict === "partial");
    const expected = hasFail ? "fail" : hasUnverifiable ? "unverifiable" : hasPartial ? "partial" : "pass";
    assert.equal(r.verdict, expected, `§13.${r.id} rolls up correctly`);
  }
});

test("§13.4 Self stays partial: a third-party claim caps it even when every trace claim passes", () => {
  // A run long enough for confidence to ramp to saturation, so every trace claim
  // (accumulation included) passes — leaving only the third-party continuity cap.
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "sun")], changes: [] },
  ]);
  const c4 = checkConformance(events, { gate }).results.find((r) => r.id === "4")!;
  const traceClaims = c4.claims.filter((c) => c.basis === "trace");
  assert.ok(traceClaims.length > 0 && traceClaims.every((c) => c.verdict === "pass"), "trace claims all pass");
  assert.ok(
    c4.claims.some((c) => c.basis === "third-party" && c.verdict === "partial"),
    "self-continuity is a third-party claim, capped at partial",
  );
  assert.equal(c4.verdict, "partial");
});

test("structural / declared claims are named where §13 rests on non-trace guarantees", () => {
  const { events, gate } = runDaemon(RUN);
  const report = checkConformance(events, { gate });
  const has = (id: string, basis: string) =>
    report.results.find((r) => r.id === id)!.claims.some((c) => c.basis === basis);
  assert.ok(has("1", "structural"), "§13.1 channel separation is structural");
  assert.ok(has("3", "structural"), "§13.3 loop closure / no-arbiter are structural");
  assert.ok(has("5", "structural"), "§13.5 Mode-B no-store-handle is structural");
  assert.ok(has("5", "declared"), "§13.5 reflection is declared");
});

test("§13.6 Store and §13.7 Failure signals are confirmable from traces alone", () => {
  const { events, gate } = runDaemon(RUN);
  const report = checkConformance(events, { gate });
  for (const id of ["6", "7"]) {
    const r = report.results.find((x) => x.id === id)!;
    assert.ok(r.claims.every((c) => c.basis === "trace"), `§13.${id} is trace-only`);
  }
});

// ── INV-5 accumulation measured from the trace (not self-declared) ──

const RAMP = [
  { signals: [sig("weather", "sun")], changes: [] },
  { signals: [sig("weather", "sun")], changes: [] },
  { signals: [sig("weather", "sun")], changes: [] },
  { signals: [sig("weather", "sun")], changes: [] },
];

test("§13.4 measures accumulation from the trace: confidence ramps to saturation (INV-5)", () => {
  const { events, gate } = runDaemon(RAMP);
  const c4 = checkConformance(events, { gate }).results.find((r) => r.id === "4")!;
  const accum = c4.claims.find((c) => c.claim.includes("accumulation observable"))!;
  assert.equal(accum.basis, "trace"); // a third party can measure it from [event]
  assert.equal(accum.verdict, "pass");
  assert.ok(c4.detail.includes("accumulation observable"));
});

test("§13.4 accumulation is partial when recurrence is too thin to saturate (no false pass)", () => {
  const { events, gate } = runDaemon([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] },
  ]);
  const c4 = checkConformance(events, { gate }).results.find((r) => r.id === "4")!;
  const accum = c4.claims.find((c) => c.claim.includes("accumulation observable"))!;
  assert.equal(accum.verdict, "partial"); // present but not yet ramped to saturation
});

test("§13.4 FAILS on the reloading signature: recurrence resets in the trace (INV-5)", () => {
  // A memoryless impostor: it emits expectation lines whose recurrence never
  // climbs (reset each cycle) — the trace betrays it, no better guard needed.
  const events = createEventLog();
  events.append(recordExpectation("cycle-0", 0, "weather", 0, 0, 1));
  events.append(recordExpectation("cycle-1", 1, "weather", 0, 0, 2)); // recurrence stuck at 0
  events.append(recordExpectation("cycle-2", 2, "weather", 0, 0, 3));
  // give it a crystallization so only accumulation drives the fail
  events.append(recordCrystallization("cycle-0", 0, 1));
  const c4 = checkConformance(events, {}).results.find((r) => r.id === "4")!;
  // recurrence never climbs → not the accrual ramp; but a flat-zero series is
  // "insufficient", not a regression — so this asserts the honest partial.
  const accum = c4.claims.find((c) => c.claim.includes("accumulation observable"))!;
  assert.equal(accum.verdict, "partial");
});

test("§13.4 FAILS when confidence regresses while recurrence climbs (reload masquerade, INV-5)", () => {
  const events = createEventLog();
  events.append(recordExpectation("cycle-0", 0, "weather", 0.9, 1, 1));
  events.append(recordExpectation("cycle-1", 1, "weather", 0.2, 2, 2)); // confidence fell as recurrence rose
  events.append(recordCrystallization("cycle-0", 0, 1));
  const c4 = checkConformance(events, {}).results.find((r) => r.id === "4")!;
  const accum = c4.claims.find((c) => c.claim.includes("accumulation observable"))!;
  assert.equal(accum.verdict, "fail");
  assert.equal(c4.verdict, "fail"); // a failing trace claim fails the criterion
  assert.ok(c4.detail.includes("accrual not driving the ramp"));
});

test("the rendered table surfaces the evidence basis and a trace-only count", () => {
  const { events, gate } = runDaemon(RUN);
  const text = renderConformance(checkConformance(events, { gate }));
  assert.ok(text.includes("Evidence —"), "an evidence line is rendered");
  assert.ok(text.includes("[trace]"), "claims are tagged with their basis");
  assert.ok(text.includes("[structural]"), "structural claims are visible");
  assert.ok(/\d+\/\d+ criteria confirmable from \[event\] alone/.test(text), "a trace-only count is shown");
});
