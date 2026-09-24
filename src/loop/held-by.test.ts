/**
 * Every datum that meets a mismatch is scarred (protocol v0.3.5 §9).
 *
 * A mismatch has two sides: what was expected and what returned. The returned
 * datum was already scarred; now the expecting side is too — each datum the
 * expectation is (`held_by`): the observation a persistence rule repeats, or a
 * program the rule names. Evidence in the window that the expectation is not
 * met nothing. A scar used again returns to `running`, so a program that keeps
 * failing circulates between the two, and a third party reads each turn.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createCycle, type Layers } from "./cycle.js";
import { createGlobMod } from "./glob-mod.js";
import {
  createT1, createT2, createT3, createT4, createT5, createT6, createT7, createT8,
} from "./layers/index.js";
import { persistence, type PredictRule } from "./layers/t5.js";
import { createDataStore, type DataStore } from "../store/data-store.js";
import { createEventLog, type EventLog } from "../store/event-log.js";
import { deserializeEventRecord, serializeEventRecord } from "../store/event-sink.js";
import type { EventRecord, ExpectationActivity, LogRecord, ProvenanceActivity } from "../store/resist-event.js";
import type { OpenTags } from "../store/tags.js";
import { checkConformance } from "../conformance/checker.js";
import type { InfoUnit, Signal } from "./types.js";

const RETURN_TAGS: OpenTags = { domain: "observation", kind: "weather", source: "ch" };
const PROGRAM_TAGS: OpenTags = { domain: "world-model", kind: "program", source: "mind" };

function sig(value: unknown, t: number): Signal {
  return { source_id: "ch", raw_payload: { entity: "weather", value }, t };
}

function loop(rule?: PredictRule) {
  const layers: Layers = {
    t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
    t5: createT5(rule ? { predict: rule } : {}), t6: createT6(), t7: createT7(), t8: createT8(),
  };
  const data = createDataStore();
  const events = createEventLog();
  let clock = 0;
  const cycle = createCycle({
    layers, glob: createGlobMod({ appraisalGain: 1 }, 0), data, events,
    initialEmission: { action: "boot" }, now: () => ++clock,
    admit: (s) => (s.source_id === "ch" ? { payload: s.raw_payload, admittingLayer: 1, open: RETURN_TAGS } : null),
  });
  const step = (i: number, v: unknown) => cycle.run({ signals: [sig(v, 100 + i)], changes: [] });
  return { step, data, events };
}

const scars = (events: EventLog) => events.all().filter((r): r is EventRecord => r.kind === "scar");
const moves = (events: EventLog, id: string) =>
  events
    .all()
    .filter((r): r is ProvenanceActivity => r.kind === "activity" && r.activityKind === "provenance" && r.datumId === id)
    .map((r) => `${r.from}→${r.to}@${r.cycleMark}`);
const provenance = (data: DataStore, id: string) => data.get(id)!.fixed.provenance;

test("persistence: the observation it repeated met the mismatch; older evidence did not", () => {
  const { step, data, events } = loop();
  step(0, "sun");
  step(1, "sun");
  step(2, "rain"); // persistence expected the "sun" of cycle 1

  assert.equal(provenance(data, "signal-2-0"), "scar", "the return");
  assert.equal(provenance(data, "signal-1-0"), "scar", "the observation the expectation was");
  assert.equal(provenance(data, "signal-0-0"), "running", "evidence in the window, not the expectation");
  assert.deepEqual(scars(events).map((s) => s.datumId), ["signal-2-0", "signal-1-0"]);
  const expectation = events
    .all()
    .find((r): r is ExpectationActivity => r.kind === "activity" && r.activityKind === "expectation" && r.cycleMark === 2)!;
  assert.deepEqual(expectation.heldBy, ["signal-1-0"], "the expectation line names what it was");
});

test("a scar used again returns to use, and scars again if it fails again", () => {
  const { step, data, events } = loop();
  step(0, "sun");
  step(1, "rain"); // signal-0-0 and signal-1-0 scar
  step(2, "sun"); // persistence expects signal-1-0: in use, then fails again
  assert.deepEqual(moves(events, "signal-1-0"), ["running→scar@1", "scar→running@2", "running→scar@2"]);
  assert.equal(provenance(data, "signal-1-0"), "scar");
  step(3, "sun"); // expects signal-2-0, which holds
  assert.deepEqual(moves(events, "signal-2-0"), ["running→scar@2", "scar→running@3"], "used, and held: back in use");
  assert.equal(provenance(data, "signal-2-0"), "running");
});

/** A rule that writes a program once, then expects "sun" and says the program is what expects it. */
function programRule(): PredictRule {
  let written = false;
  let seen = -1;
  return (entityId, window, observed, contribute, ask, write) => {
    if (observed.t !== seen) {
      seen = observed.t;
      if (!written) {
        written = true;
        write({ payload: { code: "always sun" }, open: PROGRAM_TAGS, builtFrom: [] });
        return persistence(entityId, window, observed, contribute, ask, write);
      }
    }
    if (entityId !== "weather") return persistence(entityId, window, observed, contribute, ask, write);
    const predicted: InfoUnit = { ...observed, content: { ...(observed.content as object), value: { entity: "weather", value: "sun" } } };
    return { predicted, heldBy: ["written-0-0"] };
  };
}

test("a program the rule names circulates between running and scar as its expectations meet the region", () => {
  const { step, data, events } = loop(programRule());
  step(0, "sun"); // writes the program
  step(1, "sun"); // the program arrives, runs, and holds
  step(2, "rain"); // the program's expectation fails
  step(3, "sun"); // used again, holds
  step(4, "rain"); // fails again

  assert.deepEqual(moves(events, "written-0-0"), [
    "nascent→running@1",
    "running→scar@2",
    "scar→running@3",
    "running→scar@4",
  ]);
  assert.equal(provenance(data, "written-0-0"), "scar");
  const onProgram = scars(events).filter((s) => s.datumId === "written-0-0");
  assert.equal(onProgram.length, 2, "its own scar record for each mismatch it met");
  assert.equal(onProgram[0]!.event.source_id, "weather");
  assert.equal(JSON.stringify(onProgram[0]!.event.expected).includes("sun"), true);
});

test("a name that is no datum, or a unit from no datum, is refused", () => {
  const ghost: PredictRule = (_e, _w, observed) => ({ predicted: observed, heldBy: ["ghost"] });
  assert.throws(() => loop(ghost).step(0, "sun"), /held_by names "ghost", which is no datum/);
  const made: InfoUnit = { content: { invented: true }, ref_frame: { boundLayer: 5, ref: "rule" }, t: 0 };
  const orphan: PredictRule = (_e, _w, observed) => ({ predicted: observed, heldBy: [made] });
  assert.throws(() => loop(orphan).step(0, "sun"), /a unit that came from no datum/);
});

test("the checker reads it: accepted as run, and a forged expectation fails", () => {
  const { step, events } = loop(programRule());
  for (const [i, v] of ["sun", "sun", "rain", "sun", "rain"].entries()) step(i, v);
  const report = checkConformance(events);
  assert.deepEqual(report.results.filter((r) => r.verdict === "fail").map((r) => `${r.id}: ${r.detail}`), []);
  assert.ok(report.results.find((r) => r.id === "6")!.claims.some((c) => c.claim.includes("held_by") && c.verdict === "pass"));
  for (const rec of events.all()) assert.deepEqual(deserializeEventRecord(serializeEventRecord(rec)), rec);

  // The same trace, with the program's scar at cycle 2 taken out.
  const forged = createEventLog();
  for (const r of events.all()) {
    const rec = r as LogRecord;
    if (rec.kind === "scar" && rec.datumId === "written-0-0" && rec.anchor.cycle === 2) continue;
    forged.append(rec);
  }
  const c6 = checkConformance(forged).results.find((r) => r.id === "6")!;
  assert.equal(c6.verdict, "fail");
  assert.match(c6.detail, /did not scar when it mismatched against the region/);
});
