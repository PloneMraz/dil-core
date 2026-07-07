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
 * Either way the cycle datum threads T1→T8 accruing a floor-tag and a
 * layer_trace entry at each layer, and the mode is recorded as the open tag
 * `flow` — trace-visible to an auditor (§13.3). The rest is unchanged: the
 * appraisal step (INV-8) under the cycle's GLOB-MOD context, a response that
 * feeds back as the next cycle's emission (INV-1), held collisions recorded as
 * scars in the append-only [event] log, GLOB-MOD advanced to N+1. This module
 * runs one cycle correctly; it makes no self-continuity claim.
 */

import { admitHostData } from "../store/tagging-gate.js";
import { toRunning, toScar } from "../store/data-store.js";
import { recordScar } from "../store/resist-event.js";
import { CONTEXT_ANCHOR_DEPTH } from "../store/decisions.js";
import type { DataStore } from "../store/data-store.js";
import type { EventLog } from "../store/event-log.js";
import type { ContextAnchor } from "../store/resist-event.js";
import type { TaggedDatum } from "../store/tags.js";

import { runLayer, type LayerSpec } from "./layer.js";
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
import type { Appraisal, Signal, PredErr, ModField } from "./types.js";
import type { ActivityEnvironment } from "./types.js";
import type { Emission, ObservedChange, T2Input, T2Output } from "./layers/t2.js";
import type { T3Input, T3Output } from "./layers/t3.js";
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

export interface CycleDeps {
  readonly layers: Layers;
  readonly glob: GlobMod;
  readonly data: DataStore;
  readonly events: EventLog;
  /** The host's bootstrap first emission for cycle-0 (P(a)). */
  readonly initialEmission: Emission;
}

/** What the host supplies for one cycle. */
export interface HostCycleInput {
  readonly signals: readonly Signal[];
  /** Observed changes after the emission; `id` is treated as the entity id. */
  readonly changes: readonly ObservedChange[];
  readonly interactions?: T8Input["interactions"];
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
}

/** Identifier of the agent's editable state, for the INV-8 appraisal check. */
const EDITED_STATE_ID = "agent-state";

/** What a layer pass hands to the cycle tail (appraisal, scars, feedback). */
interface LayerPass {
  readonly datum: TaggedDatum;
  readonly t5: T5Output;
  readonly t7: T7Output;
}

export function createCycle(deps: CycleDeps): Cycle {
  const { layers, glob, data, events } = deps;
  const channel = createMeaningChannel();
  let cycle = 0;
  let lastEmission = deps.initialEmission;

  /** Cycle-0: direct hand-off — one thread of flow, the driver dispatches. */
  function passSingleThreaded(
    host: HostCycleInput,
    field: ModField,
    datum0: TaggedDatum,
  ): LayerPass {
    let datum = datum0;
    const t1 = runLayer(layers.t1, host.signals, field, datum);
    datum = t1.datum;
    const t2 = runLayer(
      layers.t2,
      { env: t1.output, emitted: lastEmission, changes: host.changes },
      field,
      datum,
    );
    datum = t2.datum;
    const envPushed = new Set(
      t2.output.tagged.filter((t) => t.agency === "ENV_PUSHED").map((t) => t.change.id),
    );
    const t3 = runLayer(layers.t3, { signals: host.signals }, field, datum);
    datum = t3.datum;
    const t4 = runLayer(layers.t4, { units: t3.output.units }, field, datum);
    datum = t4.datum;
    const t5 = runLayer(layers.t5, { bound: t4.output.bound }, field, datum);
    datum = t5.datum;
    const t6 = runLayer(layers.t6, { results: t5.output.results, envPushed }, field, datum);
    datum = t6.datum;
    const t7 = runLayer(
      layers.t7,
      {
        expectations: t5.output.results.map((r) => ({
          entity_id: r.entity_id,
          predicted: r.expectation.predicted,
        })),
        observed: new Set(t5.output.results.map((r) => r.entity_id)),
      },
      field,
      datum,
    );
    datum = t7.datum;
    const t8 = runLayer(
      layers.t8,
      { others: t6.output.others, interactions: host.interactions },
      field,
      datum,
    );
    datum = t8.datum;
    return { datum, t5: t5.output, t7: t7.output };
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
    channel.publish(1, t1.output);
    const t2 = runLayer(layers.t2, gatherT2(channel, host, lastEmission), field, datum);
    datum = t2.datum;
    channel.publish(2, t2.output);
    const t3 = runLayer(layers.t3, gatherT3(host), field, datum);
    datum = t3.datum;
    channel.publish(3, t3.output);
    const t4 = runLayer(layers.t4, gatherT4(channel), field, datum);
    datum = t4.datum;
    channel.publish(4, t4.output);
    const t5 = runLayer(layers.t5, gatherT5(channel), field, datum);
    datum = t5.datum;
    channel.publish(5, t5.output);
    // Fan-out: T6 and T7 both read T5's one published output; T6 also reads T2.
    const t6 = runLayer(layers.t6, gatherT6(channel), field, datum);
    datum = t6.datum;
    channel.publish(6, t6.output);
    const t7 = runLayer(layers.t7, gatherT7(channel), field, datum);
    datum = t7.datum;
    channel.publish(7, t7.output);
    const t8 = runLayer(layers.t8, gatherT8(channel, host), field, datum);
    datum = t8.datum;
    channel.publish(8, t8.output);
    return { datum, t5: t5.output, t7: t7.output };
  }

  return {
    cycleCount: () => cycle,
    run(host): CycleResult {
      const field = glob.current();
      const flow: FlowMode = cycle === 0 ? "single-threaded" : "multi-stream";

      // The cycle datum, threaded T1→T8 so it accrues a floor-tag at each
      // layer; the flow mode rides along as an open tag (trace-visible, §13.3).
      const admitted: TaggedDatum = toRunning(
        admitHostData(
          {
            payload: { signals: host.signals.length, cycle },
            admittingLayer: 1,
            open: { domain: "cycle", phase: "loop", source: "driver", flow },
          },
          cycle,
        ),
        cycle,
      );

      const pass =
        flow === "single-threaded"
          ? passSingleThreaded(host, field, admitted)
          : passMultiStream(host, field, admitted);
      let datum = pass.datum;

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
      });

      // ── Respond → feedback (INV-1): the response is the next emission ──
      const response: Emission = { action: { kind: "respond", cycle, valence: appraisal.valence } };

      // ── Collisions that hold → scars in [event] ──
      // Each collision is sourced: a value-mismatch by the entity that resisted,
      // an absence by the region. The source set drives diversity monitoring.
      const collisions: { source_id: string; e: PredErr }[] = [
        ...pass.t5.results
          .filter((r) => r.predErr.delta > 0)
          .map((r) => ({ source_id: r.entity_id, e: r.predErr })),
        ...pass.t7.absences.map((e) => ({ source_id: "region", e })),
      ];
      let scars = 0;
      const collisionSources = new Set<string>();
      if (collisions.length > 0) {
        const scarDatum = toScar(datum, true);
        const anchor: ContextAnchor = {
          depth: CONTEXT_ANCHOR_DEPTH,
          cycle,
          fieldState: field.params,
        };
        for (const { source_id, e } of collisions) {
          events.append(
            recordScar(
              scarDatum,
              {
                source_id,
                expected: e.predicted.content,
                received: e.observed?.content ?? null,
                mismatch_kind: e.observed === null ? "absence" : "value-mismatch",
                t: cycle,
              },
              anchor,
            ),
          );
          collisionSources.add(source_id);
          scars += 1;
        }
        datum = scarDatum;
      }

      // Persist the cycle datum in [data] (mutable working memory).
      data.put(`cycle-${cycle}`, datum);

      // ── GLOB-MOD: contribute this cycle's resistance, advance to N+1 (INV-7) ──
      const totalResistance = predErrs.reduce((s, e) => s + e.delta, 0);
      glob.contribute(5, { resistance: totalResistance }, 1);
      glob.advance(cycle + 1);

      // Feedback + accrual: the response becomes the next cycle's emission.
      lastEmission = response;
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
