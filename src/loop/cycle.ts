/**
 * The cycle driver (protocol §6; stage 4e + multi-stream).
 *
 * Runs ONE pass of the loop per cycle, in one of two flow modes:
 *   - Cycle-0 — SINGLE-THREADED: a direct hand-off pipeline T1→T8, because
 *     multi-stream flow presupposes a self for the streams to coordinate
 *     around, and at cycle-0 it does not yet exist.
 *   - Cycle-1 onward — MULTI-STREAM (the self crystallized at T2 of cycle-0,
 *     §7): every layer is an active site; each publishes its output on the
 *     meaning-channel and each consumer READS its declared dependency set from
 *     it — consumption, not dispatch, INV-3 guarded per read; fan-out is real
 *     (T5's one published output is read by both T6 and T7, T6 reads T2's
 *     output itself). The schedule is declared in decisions.ts
 *     (MULTI_STREAM_SCHEDULE): one topological activation pass, cycle-time not
 *     wall-clock — no OS concurrency claimed.
 *
 * Either way the cycle datum threads T1→T8, its floor-tag updating to the
 * current layer and each layer-exit recorded as a lean line in the `[event]` log
 * (the path lives there, never in a running-type field — v0.3.2 §6.1); the mode
 * is recorded as the open tag `flow` — trace-visible to an auditor (§13.3). The
 * rest is unchanged: the
 * appraisal step (INV-8) under the cycle's GLOB-MOD context, a response that
 * feeds back as the next cycle's emission (INV-1), held collisions recorded as
 * scars in the append-only [event] log, GLOB-MOD advanced to N+1. This module
 * runs one cycle correctly; it makes no self-continuity claim.
 */

import { admitHostData, type HostDatum } from "../store/tagging-gate.js";
import { stampLayer, toRunning, toScar, toSimulated, toProjected } from "../store/data-store.js";
import {
  recordScar,
  recordActivity,
  recordLayerExit,
  recordProvenance,
  recordEmission,
  recordCrystallization,
  recordExpectation,
  recordResistanceReading,
} from "../store/resist-event.js";
import { CONTEXT_ANCHOR_DEPTH, FIT_FLOOR, FIT_FLOOR_PARAM, H_COUNT } from "../store/decisions.js";
import type { DataStore } from "../store/data-store.js";
import type { EventLog } from "../store/event-log.js";
import type { ContextAnchor, RecalledTags } from "../store/resist-event.js";
import type { TaggedDatum } from "../store/tags.js";

import { runLayer, type LayerContribution, type LayerEmission, type LayerSpec } from "./layer.js";
import { appraise } from "./appraisal.js";
import { createMeaningChannel } from "./meaning-channel.js";
import {
  gatherT2,
  gatherT3,
  gatherT4,
  gatherT5,
  gatherT6,
  gatherT7,
  gatherT8,
} from "./gathers.js";
import type { GlobMod } from "./glob-mod.js";
import type { Appraisal, Signal, PredErr, ModField, LayerIndex, Directive, InfoUnit } from "./types.js";
import type { ActivityEnvironment } from "./types.js";
import type { Emission, ObservedChange, T2Input, T2Output } from "./layers/t2.js";
import { isStoreQuery, storeQuery, type T3Input, type T3Output } from "./layers/t3.js";
import { answerQuery, type StoreReturn } from "./store-query.js";
import type { T4Input, T4Output } from "./layers/t4.js";
import type { T5Input, T5Output } from "./layers/t5.js";
import type { T6Input, T6Output } from "./layers/t6.js";
import type { T7Input, T7Output } from "./layers/t7.js";
import type { T8Input, T8Output } from "./layers/t8.js";

/** The eight layer specs the driver runs (created once; they accrue state). */
export interface Layers {
  readonly t1: LayerSpec<readonly Signal[], ActivityEnvironment>;
  readonly t2: LayerSpec<T2Input, T2Output>;
  readonly t3: LayerSpec<T3Input, T3Output>;
  readonly t4: LayerSpec<T4Input, T4Output>;
  readonly t5: LayerSpec<T5Input, T5Output>;
  readonly t6: LayerSpec<T6Input, T6Output>;
  readonly t7: LayerSpec<T7Input, T7Output>;
  readonly t8: LayerSpec<T8Input, T8Output>;
}

import type { RecalledFrom } from "./recollection.js";

export interface CycleDeps {
  readonly layers: Layers;
  readonly glob: GlobMod;
  readonly data: DataStore;
  readonly events: EventLog;
  /** The host's bootstrap first emission for cycle-0 (P(a)). */
  readonly initialEmission: Emission;
  /**
   * The host's server clock — epoch milliseconds (requisition; the wall-clock
   * where the host operates). Stamps `[event]` timestamps so an auditor can
   * compare and sync a datum's diary. Defaults to `Date.now()` for the minimal
   * host. The `cycleMark` (which cycle) is recorded separately from this.
   */
  readonly now?: () => number;
  /** RECOVERY-ONLY: resume the driver from a §9 snapshot instead of cycle-0. */
  readonly resume?: DriverState;
  /**
   * The host's resistance-retrieval channel (§10), if one is declared.
   *
   * The driver does not call it — T5 does, through its declared PredictRule. The
   * driver only asks which scars it returned, so their return can be recorded in
   * `[event]` (§9: every transition along a provenance edge is recorded as it
   * occurs). Without this, `scar → running` could never fire and the store would
   * stay write-only.
   */
  readonly recollection?: { drain(): readonly RecalledFrom[] };
  /**
   * How a return from the region enters `[data]`: its payload and open tags,
   * or null to keep that one out (§10: selective-write is `DECIDE@IMPL`).
   * Defaults to `admitReturn`, which keeps every one. See `AdmitPolicy`.
   */
  readonly admit?: AdmitPolicy;
}

/**
 * What the region returns is data. An expectation is compared against it, and a
 * `scar` is the datum that "collided with resistance and held" (§3, §9): if the
 * return is not a datum, there is nothing for the tag to be on, and the mismatch
 * does not say what it was a mismatch with. So each return enters `[data]`
 * through the tagging-gate like any host data (§9: T1 ingests "`Signal[]` from
 * the host's existing data"), runs as `running`, leaves a line at every layer it
 * exits, and — when the expectation about it fails — is itself the datum that
 * moves to `scar`, the scar record naming it.
 *
 * The policy says which open tags a return carries (§12 tag F: the vocabulary is
 * the host's), or returns null to keep one out.
 */
export type AdmitPolicy = (signal: Signal) => HostDatum | null;

/**
 * The reference admission: every return, described by what the driver can see
 * of it without interpreting it — that it came from the region, by which
 * channel, in what form. A host with a vocabulary of its own declares its own.
 */
export const admitReturn: AdmitPolicy = (signal) => ({
  payload: signal.raw_payload,
  admittingLayer: 1,
  open: { domain: "region", source: signal.source_id, format: formatOf(signal.raw_payload) },
});

function formatOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/** The cycle driver's own accrued state (part of the §9 snapshot). */
export interface DriverState {
  readonly cycle: number;
  readonly lastEmission: Emission;
  /**
   * Store query-returns answered at the close of the last cycle and not yet
   * ingested (§6.4 T3 query). They arrive at T1 of the next cycle.
   */
  readonly pendingReturns?: readonly Signal[];
  /** Every datum ever recalled from the store — they return only when asked. */
  readonly recalled?: readonly string[];
  /** Actions layers emitted laterally last cycle, for T2 to read (§6.4). */
  readonly lastLateral?: readonly unknown[];
}

/** What the host supplies for one cycle. */
export interface HostCycleInput {
  readonly signals: readonly Signal[];
  /** Observed changes after the emission; `id` is treated as the entity id. */
  readonly changes: readonly ObservedChange[];
  readonly interactions?: T8Input["interactions"];
  /**
   * Entity ids the region reports PRESENT this cycle — able to return if they
   * are going to. T7 registers an absence only against these.
   *
   * Silence presupposes the chance to speak: an entity the region itself says is
   * not there is not silent, it is simply not there. Omitting it keeps the
   * original behaviour exactly.
   */
  readonly present?: ReadonlySet<string>;
}

/** The flow mode a cycle ran in (protocol §6, §13.3). */
export type FlowMode = "single-threaded" | "multi-stream";

export interface CycleResult {
  readonly cycle: number;
  /** The flow mode this cycle ran in (also recorded as the `flow` open tag). */
  readonly flow: FlowMode;
  readonly appraisal: Appraisal;
  /** The action emitted — the next cycle's emission (feedback, INV-1). */
  readonly response: Emission;
  /** Collisions recorded as scars in [event] this cycle. */
  readonly scars: number;
  readonly absences: number;
  /** Distinct sources whose return resisted this cycle (for diversity monitoring). */
  readonly collisionSources: readonly string[];
}

export interface Cycle {
  run(host: HostCycleInput): CycleResult;
  cycleCount(): number;
  /** The driver's accrued state, for the §9 commit snapshot. */
  snapshot(): DriverState;
}

/** Identifier of the agent's editable state, for the INV-8 appraisal check. */
const EDITED_STATE_ID = "agent-state";

/** What a layer pass hands to the cycle tail (appraisal, scars, feedback). */
interface LayerPass {
  readonly datum: TaggedDatum;
  readonly t5: T5Output;
  readonly t7: T7Output;
  /** T2 first drew the self/environment distinction this pass (§7 crystallization). */
  readonly crystallized: boolean;
  /** Lateral emissions raised by any layer during this pass (§6.4), each bound to its issuer. */
  readonly emissions: readonly LayerEmission[];
  /** Field contributions declared by any layer during this pass (INV-7), each bound to its issuer. */
  readonly contributions: readonly LayerContribution[];
  /** T3's units, one per signal in the signals' order: how a T5 observation finds its datum. */
  readonly units: readonly InfoUnit[];
}

export function createCycle(deps: CycleDeps): Cycle {
  const { layers, glob, data, events } = deps;
  const channel = createMeaningChannel();
  const now = deps.now ?? ((): number => Date.now());
  let cycle = deps.resume?.cycle ?? 0;
  let lastEmission = deps.resume?.lastEmission ?? deps.initialEmission;
  /** Store query-returns awaiting ingestion at the next cycle's T1 (§6.4). */
  let pending: Signal[] = [...(deps.resume?.pendingReturns ?? [])];
  /** What layers emitted laterally last cycle — readable by T2 now (§6.4 rule 3). */
  let lastLateral: readonly unknown[] = deps.resume?.lastLateral ?? [];
  /** Every datum ever recalled; each returns only on a cycle it was asked for. */
  const recalled = new Set<string>(deps.resume?.recalled ?? []);
  /** Recalled data not arriving this cycle — no absence is owed by them (T7). */
  let unasked: ReadonlySet<string> = new Set();
  /** Wall-clock (host server clock, epoch-ms) of the cycle currently running. */
  let cycleT = 0;

  /** The id the cycle datum takes in `[data]`; also its key in the `[event]` path. */
  const datumId = (): string => `cycle-${cycle}`;
  /**
   * Data recalled from the store that run this cycle. They pass the layers with
   * the cycle datum, so each exit is theirs too: "every layer a datum exits
   * MUST be recorded" (§9), and there are no pass-through layers.
   */
  let runningRecalled: readonly string[] = [];
  /** The region's returns admitted this cycle; they pass the layers with the cycle datum too. */
  let runningAdmitted: readonly string[] = [];
  const admit = deps.admit ?? admitReturn;
  /** Log one `layer-exit` line per datum as it leaves a layer (§9: path in [event]). */
  function logExit(layer: LayerIndex): void {
    events.append(recordLayerExit(datumId(), cycle, layer, cycleT));
    for (const id of [...runningRecalled, ...runningAdmitted]) {
      events.append(recordLayerExit(id, cycle, layer, cycleT));
    }
  }
  /**
   * Emission — link 5 as a lateral capability (§6.4). The one sink through which
   * every emission is recorded: it writes exactly one activity record naming the
   * issuing layer (register ↔, never =). There is NO internal arbiter — a conflict
   * among emissions is collided against the region, not adjudicated. Two callers
   * reach it: any layer, via the bound `emit` handed to its `process` (drained
   * from the pass, each carrying its own issuing layer, §6.4); and the driver, for
   * the appraisal-driven terminal response at the close of the meaning-channel
   * (issuing layer T8). Returns the action so a caller can also feed it forward.
   */
  function emit(issuingLayer: LayerIndex, action: unknown): unknown {
    events.append(recordEmission(datumId(), cycle, issuingLayer, action, cycleT));
    return action;
  }

  /** Cycle-0: direct hand-off — one thread of flow, the driver dispatches. */
  function passSingleThreaded(
    host: HostCycleInput,
    field: ModField,
    datum0: TaggedDatum,
  ): LayerPass {
    let datum = datum0;
    const t1 = runLayer(layers.t1, host.signals, field, datum);
    datum = t1.datum;
    logExit(1);
    const t2 = runLayer(
      layers.t2,
      { env: t1.output, emitted: lastEmission, changes: host.changes, lateral: lastLateral },
      field,
      datum,
    );
    datum = t2.datum;
    logExit(2);
    const envPushed = new Set(
      t2.output.tagged.filter((t) => t.agency === "ENV_PUSHED").map((t) => t.change.id),
    );
    const t3 = runLayer(layers.t3, { signals: host.signals }, field, datum);
    datum = t3.datum;
    logExit(3);
    const t4 = runLayer(layers.t4, { units: t3.output.units }, field, datum);
    datum = t4.datum;
    logExit(4);
    const t5 = runLayer(layers.t5, { bound: t4.output.bound }, field, datum);
    datum = t5.datum;
    logExit(5);
    const t6 = runLayer(layers.t6, { results: t5.output.results, envPushed }, field, datum);
    datum = t6.datum;
    logExit(6);
    const t7 = runLayer(
      layers.t7,
      {
        expectations: t5.output.results.map((r) => ({
          entity_id: r.entity_id,
          predicted: r.expectation.predicted,
        })),
        observed: new Set(t5.output.results.map((r) => r.entity_id)),
        unasked,
      },
      field,
      datum,
    );
    datum = t7.datum;
    logExit(7);
    const t8 = runLayer(
      layers.t8,
      { others: t6.output.others, interactions: host.interactions },
      field,
      datum,
    );
    datum = t8.datum;
    logExit(8);
    const emissions = [t1, t2, t3, t4, t5, t6, t7, t8].flatMap((r) => r.emissions);
    const contributions = [t1, t2, t3, t4, t5, t6, t7, t8].flatMap((r) => r.contributions);
    return {
      datum,
      t5: t5.output,
      t7: t7.output,
      crystallized: t2.output.crystallized,
      emissions,
      contributions,
      units: t3.output.units,
    };
  }

  /**
   * Cycle-1+: multi-stream — each layer publishes; each consumer gathers its
   * declared dependency set from the channel (consumption, not dispatch).
   */
  function passMultiStream(
    host: HostCycleInput,
    field: ModField,
    datum0: TaggedDatum,
  ): LayerPass {
    let datum = datum0;
    channel.clear();
    const t1 = runLayer(layers.t1, host.signals, field, datum);
    datum = t1.datum;
    logExit(1);
    channel.publish(1, t1.output);
    const t2 = runLayer(layers.t2, gatherT2(channel, host, lastEmission, lastLateral), field, datum);
    datum = t2.datum;
    logExit(2);
    channel.publish(2, t2.output);
    const t3 = runLayer(layers.t3, gatherT3(host), field, datum);
    datum = t3.datum;
    logExit(3);
    channel.publish(3, t3.output);
    const t4 = runLayer(layers.t4, gatherT4(channel), field, datum);
    datum = t4.datum;
    logExit(4);
    channel.publish(4, t4.output);
    const t5 = runLayer(layers.t5, gatherT5(channel), field, datum);
    datum = t5.datum;
    logExit(5);
    channel.publish(5, t5.output);
    // Fan-out: T6 and T7 both read T5's one published output; T6 also reads T2.
    const t6 = runLayer(layers.t6, gatherT6(channel), field, datum);
    datum = t6.datum;
    logExit(6);
    channel.publish(6, t6.output);
    const t7 = runLayer(layers.t7, gatherT7(channel, host, unasked), field, datum);
    datum = t7.datum;
    logExit(7);
    channel.publish(7, t7.output);
    const t8 = runLayer(layers.t8, gatherT8(channel, host), field, datum);
    datum = t8.datum;
    logExit(8);
    channel.publish(8, t8.output);
    const emissions = [t1, t2, t3, t4, t5, t6, t7, t8].flatMap((r) => r.emissions);
    const contributions = [t1, t2, t3, t4, t5, t6, t7, t8].flatMap((r) => r.contributions);
    return {
      datum,
      t5: t5.output,
      t7: t7.output,
      crystallized: t2.output.crystallized,
      emissions,
      contributions,
      units: t3.output.units,
    };
  }

  return {
    cycleCount: () => cycle,
    snapshot: () => ({
      cycle,
      lastEmission,
      pendingReturns: [...pending],
      recalled: [...recalled],
      lastLateral: [...lastLateral],
    }),
    run(regionInput): CycleResult {
      const field = glob.current();

      // ── Query-returns join what the region returned (§6, link 1) ──
      // "Input channels: query returns, messages from an Other, event streams,
      // the result of a prior action." What T3 asked the store for last cycle
      // arrives now, at T1, and runs every layer like anything else that
      // arrives. A return is present on the cycle it arrives, and only then: a
      // memory that was not recalled is not silent, it was not asked.
      const returned = pending;
      pending = [];
      const arriving = new Set(returned.map((s) => (s.raw_payload as StoreReturn).entity));
      for (const id of arriving) recalled.add(id);
      unasked = new Set([...recalled].filter((id) => !arriving.has(id)));
      // Each return is also a change the agent's own query produced: its value
      // is the query that asked, so T2 matches it to that emission and tags it
      // SELF_WRITTEN — §6.4's closure, "emit → region returns → T1 ingests → T2
      // matches". The datum's CONTENT is still not the agent's own; agency and
      // provenance are two different questions.
      const host: HostCycleInput =
        returned.length === 0
          ? regionInput
          : {
              ...regionInput,
              signals: [...regionInput.signals, ...returned],
              changes: [
                ...regionInput.changes,
                ...returned.map((s) => {
                  const r = s.raw_payload as StoreReturn;
                  return { id: r.entity, value: storeQuery(r.cue) };
                }),
              ],
            };
      const flow: FlowMode = cycle === 0 ? "single-threaded" : "multi-stream";
      cycleT = now(); // the host server clock at this cycle (epoch-ms), for [event] timestamps

      // The cycle datum, threaded T1→T8 so it accrues a floor-tag at each
      // layer; the flow mode rides along as an open tag (trace-visible, §13.3).
      const admitted: TaggedDatum = toRunning(
        admitHostData(
          {
            payload: { signals: host.signals.length, cycle },
            admittingLayer: 1,
            open: { domain: "cycle", phase: "loop", source: "driver", flow },
          },
          cycleT, // timestamp = wall-clock; the cycle number is the separate cycle-mark
        ),
        cycle,
      );
      // prior → running: the admitted host datum has run this cycle (a lean line).
      events.append(recordProvenance(datumId(), cycle, "prior", "running", cycleT));

      // prior → running, for each recalled datum that had not run before (§9):
      // "Host data, once admitted and once it has run, bears a cycle-mark." It
      // runs now, so it takes this cycle's mark, and the move is recorded as it
      // occurs. `prior` is a one-way entry: a datum already in circulation is
      // returned as it is, and no edge is recorded for being read.
      for (const s of returned) {
        const id = (s.raw_payload as StoreReturn).entity;
        const held = data.get(id);
        if (held !== undefined && held.fixed.provenance === "prior") {
          data.put(id, toRunning(held, cycle));
          events.append(recordProvenance(id, cycle, "prior", "running", cycleT));
        }
      }
      runningRecalled = returned
        .map((s) => (s.raw_payload as StoreReturn).entity)
        .filter((id) => data.has(id));

      // prior → running, for each return from the region (see `AdmitPolicy`).
      // It enters through the tagging-gate and runs now, so it takes this
      // cycle's mark. The region's signals come first in `host.signals`, so
      // signal i is T3's unit i.
      const admittedAt = new Map<number, string>();
      regionInput.signals.forEach((signal, i) => {
        const declared = admit(signal);
        if (declared === null) return;
        const id = `signal-${cycle}-${i}`;
        data.put(id, toRunning(admitHostData(declared, cycleT), cycle));
        events.append(recordProvenance(id, cycle, "prior", "running", cycleT));
        admittedAt.set(i, id);
      });
      runningAdmitted = [...admittedAt.values()];
      const admittedNow = new Set(runningAdmitted);

      const pass =
        flow === "single-threaded"
          ? passSingleThreaded(host, field, admitted)
          : passMultiStream(host, field, admitted);
      let datum = pass.datum;

      // Each recalled datum left T8 with the cycle datum: its floor-tag names the
      // layer it just exited (§9 fixed layer). Its tag set — never its content —
      // goes into this cycle's activity record, so the trace shows what class of
      // data entered and that it came through the gate (§9 open layer, §13.6).
      const recalledTags: RecalledTags[] = [];
      for (const id of runningRecalled) {
        const ran = stampLayer(data.get(id)!, 8);
        data.put(id, ran);
        recalledTags.push({ datumId: id, fixed: ran.fixed, open: ran.open });
      }
      runningRecalled = [];

      // The same for each return admitted this cycle: it left T8 with the cycle
      // datum, and its tag set — never its content — goes into the record.
      const admittedTags: RecalledTags[] = [];
      for (const id of runningAdmitted) {
        const ran = stampLayer(data.get(id)!, 8);
        data.put(id, ran);
        admittedTags.push({ datumId: id, fixed: ran.fixed, open: ran.open });
      }
      runningAdmitted = [];
      // Which admitted datum each observation came from, by the unit itself:
      // T4 and T5 carry T3's units through unchanged.
      const datumOf = new Map<InfoUnit, string>();
      for (const [i, id] of admittedAt) {
        const unit = pass.units[i];
        if (unit !== undefined) datumOf.set(unit, id);
      }

      // ── §7 crystallization: T2 drew the self/environment distinction ──
      // The one-time act where the from-within standpoint begins (T2 of cycle-0).
      // Recorded as a lean trace line — the ACT of distinguishing self from
      // environment, never a persistent/continuing self (the §7 forbidden claim).
      // A resumed line has already crystallized; T2 does not re-signal.
      if (pass.crystallized) {
        events.append(recordCrystallization(datumId(), cycle, cycleT));
      }

      // ── Lateral emissions raised during the pass (§6.4) ──
      // Any layer MAY have pushed a committed action to the region during its
      // work (a T2 probe, T3 query, T5 test, T6 model-test); each is recorded as
      // one activity record naming its issuing layer (§9), register ↔. Under the
      // minimal scripted host no layer emits (no live region to push to) — the
      // capability is afforded, not fabricated; the buffer is then empty.
      for (const e of pass.emissions) emit(e.issuingLayer, e.action);

      // ── The store answers the queries raised this cycle (§6.4, §9 open layer) ──
      // Answered now, ingested at T1 next cycle. Answering changes nothing in
      // `[data]`; the datum moves only when it runs. Memory is what the store
      // held before the cycle that asks: what arrived this cycle is already
      // running in it, and answering with it would recall what is being seen.
      for (const e of pass.emissions) {
        if (!isStoreQuery(e.action)) continue;
        for (const s of answerQuery(data, e.action.cue, cycleT)) {
          const id = (s.raw_payload as StoreReturn).entity;
          if (admittedNow.has(id)) continue;
          if (!pending.some((p) => (p.raw_payload as StoreReturn).entity === id)) pending.push(s);
        }
      }

      // ── Expectation readings: the observable signature of accumulation (INV-5) ──
      // One lean line per observed entity: its prediction confidence and the
      // recurrence that drove it. A third party reads these back grouped by entity
      // and measures the ramp (§13.4) — an accruing self makes confidence and
      // recurrence climb together; a reloading impostor cannot.
      for (const r of pass.t5.results) {
        // `source === entity_id`: for a value-mismatch, the entity IS the resistance
        // source (the scar's source_id, cycle.ts collisions) — recorded explicitly.
        events.append(
          recordExpectation(datumId(), cycle, r.entity_id, r.entity_id, r.expectation.confidence, r.expectation.recurrence, r.predErr.delta, cycleT),
        );
      }
      // ── Resistance readings for absences (§8, T7) ──
      // The expectation line covers value-mismatch sources; a region that withholds
      // an expected return resists by absence. Record that per-source too (source
      // `region`, matching the absence scar's source_id), so no resistance source
      // is left un-measurable in the trace (§8.3 absorption covers absences too).
      for (const a of pass.t7.absences) {
        events.append(
          recordResistanceReading(datumId(), cycle, "region", a.entity_id, "absence", a.recurrence, a.delta, "-", cycleT),
        );
      }

      // ── Scars that returned as material (§9, `scar → running`) ──
      // A recalled scar is "data in use"; §9 is explicit that a scar is not a
      // resting place. The datum key is the recalled scar's own (`cycle-N`), not
      // this cycle's: it is that datum which moved, not this one.
      for (const r of deps.recollection?.drain() ?? []) {
        events.append(recordProvenance(`cycle-${r.cycle}`, cycle, "scar", "running", cycleT));
      }

      // ── Forward-building (§6.2): build situations, cast outcomes ──
      // The datum takes the running→simulated→projected road WHEN the store
      // affords material — an entity whose expectation has accrued confidence.
      // No material (cold start) → it stays running and, on collision, reflexes
      // straight to scar (§5/§8.7). This is a CONDITION on the road, not a
      // scheduled step; which road the datum takes depends on the situation.
      // Attention over situations (INV-7): the field raises the floor a
      // situation's fit must clear before the loop builds from it. The default
      // floor is 0, which is what the loop always did. Nothing here skips an
      // expectation or alters a recorded confidence — see FIT_FLOOR for why
      // both of those are unsafe.
      const fitFloor = field.params[FIT_FLOOR_PARAM] ?? FIT_FLOOR;
      const material = pass.t5.results.filter((r) => r.expectation.confidence > fitFloor);
      let forwardBuilt = false;
      let projectedUnits: readonly InfoUnit[] = [];
      if (material.length > 0) {
        // running → simulated: the loop takes the datum up into building situations
        datum = toSimulated(datum);
        events.append(recordProvenance(datumId(), cycle, "running", "simulated", cycleT));
        // Build up to H_COUNT situations (a ceiling, not a quota). Fit = the store's
        // support for the situation (accrued confidence); the closer-fitting
        // outcomes carry, blended by fit (INV-7), never a hard scored winner.
        const situations = [...material]
          .sort((a, b) => b.expectation.confidence - a.expectation.confidence)
          .slice(0, H_COUNT);
        // simulated → projected: each situation yields the outcome cast from it
        datum = toProjected(datum);
        events.append(recordProvenance(datumId(), cycle, "simulated", "projected", cycleT));
        projectedUnits = situations.map((r) => r.expectation.predicted);
        forwardBuilt = true;
      }

      // ── Appraisal step (INV-8), under the cycle's field context (§8.5) ──
      const predErrs: PredErr[] = [
        ...pass.t5.results.map((r) => r.predErr),
        ...pass.t7.absences,
      ];
      const appraisal = appraise({
        infoRef: `cycle-${cycle}`,
        predErrs,
        field,
        editedState: EDITED_STATE_ID,
        projected: projectedUnits, // not-yet-collided outcomes (§6.4)
      });

      // ── Respond (link 5, §6.4): the cycle's committed action, register ↔ ──
      // The one real emission per cycle under the minimal host; issued at the
      // close of the meaning-channel after appraisal, so its issuing layer is T8.
      const directive: Directive = {
        committed_action: { kind: "respond", cycle, valence: appraisal.valence },
        register: "↔",
        issuing_layer: 8,
        built_from: [appraisal],
        t: cycleT,
      };
      const response: Emission = { action: directive.committed_action };

      // ── Collisions that hold → scars in [event] ──
      // Each collision is sourced: a value-mismatch by the entity that resisted,
      // an absence by the region. The source set drives diversity monitoring.
      const collisions: { source_id: string; e: PredErr }[] = [
        ...pass.t5.results
          .filter((r) => r.predErr.delta > 0)
          .map((r) => ({ source_id: r.entity_id, e: r.predErr })),
        ...pass.t7.absences.map((e) => ({ source_id: "region", e })),
      ];
      const anchor: ContextAnchor = {
        depth: CONTEXT_ANCHOR_DEPTH,
        cycle,
        fieldState: field.params,
      };
      let scars = 0;
      const collisionSources = new Set<string>();
      if (collisions.length > 0) {
        const scarDatum = toScar(datum, true);
        // → scar: from `projected` if a cast preceded the collision, else a direct
        // `running → scar` (reflex, §5/§8.7). Which road it was depends on whether
        // the store afforded a forward-cast this cycle — a situational fact.
        events.append(
          recordProvenance(datumId(), cycle, forwardBuilt ? "projected" : "running", "scar", cycleT),
        );
        for (const { source_id, e } of collisions) {
          // What collided is the return the expectation was compared against:
          // that datum moves to `scar` (§9 `running → scar`), and the record
          // embeds and names it. An absence has no return, so the cycle datum
          // stands for it.
          const collidedId = e.observed !== null ? datumOf.get(e.observed) : undefined;
          let collided = scarDatum;
          if (collidedId !== undefined) {
            const held = data.get(collidedId)!;
            collided = toScar(held, true);
            data.put(collidedId, collided);
            events.append(recordProvenance(collidedId, cycle, held.fixed.provenance, "scar", cycleT));
          }
          events.append(
            recordScar(
              collided,
              {
                source_id,
                expected: e.predicted.content,
                received: e.observed?.content ?? null,
                mismatch_kind: e.observed === null ? "absence" : "value-mismatch",
                t: cycleT,
              },
              anchor,
              collidedId,
            ),
          );
          collisionSources.add(source_id);
          scars += 1;
        }
        datum = scarDatum;
      } else if (forwardBuilt) {
        // projected → running: the cast produced no scar; the datum returns to use
        // (a datum is never a conclusion at rest — §9).
        datum = toRunning(datum, cycle);
        events.append(recordProvenance(datumId(), cycle, "projected", "running", cycleT));
      }

      // ── Emit the cycle's committed action (link 5, §6.4) ──
      // Records one emission line naming the issuing layer (T8); register ↔.
      emit(directive.issuing_layer, directive.committed_action);

      // ── Activity record: the cycle's trace, sealing the cycle (§9) ──
      // Trace, not experience: no layer learns from it. It keeps the audit
      // trail complete across quiet stretches (E4) — one record per cycle.
      events.append(
        recordActivity(
          datumId(),
          datum,
          {
            cycle,
            flow,
            emitted: response.action,
            observed: pass.t5.results.map((r) => r.entity_id),
            scars,
            t: cycleT,
            ...(recalledTags.length > 0 ? { recalled: recalledTags } : {}),
            ...(admittedTags.length > 0 ? { admitted: admittedTags } : {}),
          },
          anchor,
        ),
      );

      // Persist the cycle datum in [data] (mutable working memory).
      data.put(`cycle-${cycle}`, datum);

      // ── GLOB-MOD: the cycle's contributions blend, and take effect at N+1 ──
      // INV-7: "Every layer contributes to it as one competing parameter;
      // contributions blend, re-weighted each cycle, never last-write-wins."
      // Each layer's own contributions go in first, bound to its index by
      // `runLayer`; the driver adds the cycle's total resistance last, as it
      // always did. With more than one contributor the blend is finally doing
      // what its name says.
      for (const c of pass.contributions) glob.contribute(c.layer, c.params, c.weight);
      const totalResistance = predErrs.reduce((s, e) => s + e.delta, 0);
      glob.contribute(5, { resistance: totalResistance }, 1);
      glob.advance(cycle + 1);

      // Feedback + accrual: the response becomes the next cycle's emission, and
      // every lateral emission of this cycle is readable by T2 next cycle too.
      lastEmission = response;
      lastLateral = pass.emissions.map((e) => e.action);
      cycle += 1;

      return {
        cycle: cycle - 1,
        flow,
        appraisal,
        response,
        scars,
        absences: pass.t7.absences.length,
        collisionSources: [...collisionSources],
      };
    },
  };
}
