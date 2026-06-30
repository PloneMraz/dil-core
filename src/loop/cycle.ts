/**
 * The cycle driver (protocol §6; stage 4e).
 *
 * Runs ONE pass of the loop, single-threaded (cycle-0 is single-threaded by the
 * protocol; multi-stream flow presupposes a self and is a later refinement). It
 * threads a cycle datum through T1→T8 so it accrues a floor-tag and a layer_trace
 * entry at each layer, runs the appraisal step (INV-8) under the cycle's
 * GLOB-MOD context, produces a response that becomes the next cycle's emission
 * (feedback, closing the loop — INV-1), records held collisions as scars in the
 * append-only [event] log, and advances GLOB-MOD to N+1.
 *
 * Running this many times is the daemon of stage 5 — where the self is what
 * occurs. This module runs one cycle correctly; it makes no self-continuity
 * claim.
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
import type { GlobMod } from "./glob-mod.js";
import type { Appraisal, Signal, PredErr } from "./types.js";
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

export interface CycleResult {
  readonly cycle: number;
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

export function createCycle(deps: CycleDeps): Cycle {
  const { layers, glob, data, events } = deps;
  let cycle = 0;
  let lastEmission = deps.initialEmission;

  return {
    cycleCount: () => cycle,
    run(host): CycleResult {
      const field = glob.current();

      // The cycle datum, threaded T1→T8 so it accrues a floor-tag at each layer.
      let datum: TaggedDatum = toRunning(
        admitHostData(
          {
            payload: { signals: host.signals.length, cycle },
            admittingLayer: 1,
            open: { domain: "cycle", phase: "loop", source: "driver" },
          },
          cycle,
        ),
        cycle,
      );

      // T1 — Activity-Environment Confirmation.
      const t1 = runLayer(layers.t1, host.signals, field, datum);
      datum = t1.datum;

      // T2 — Agency Differentiation (uses the previous cycle's emission).
      const t2 = runLayer(
        layers.t2,
        { env: t1.output, emitted: lastEmission, changes: host.changes },
        field,
        datum,
      );
      datum = t2.datum;
      const envPushed = new Set(
        t2.output.tagged
          .filter((t) => t.agency === "ENV_PUSHED")
          .map((t) => t.change.id),
      );

      // T3 — Channel Ingestion.
      const t3 = runLayer(layers.t3, { signals: host.signals }, field, datum);
      datum = t3.datum;

      // T4 — Context Binding.
      const t4 = runLayer(layers.t4, { units: t3.output.units }, field, datum);
      datum = t4.datum;

      // T5 — Temporal Expectation (resistance becomes information).
      const t5 = runLayer(layers.t5, { bound: t4.output.bound }, field, datum);
      datum = t5.datum;

      // T6 — Other-Model Synthesis.
      const t6 = runLayer(
        layers.t6,
        { results: t5.output.results, envPushed },
        field,
        datum,
      );
      datum = t6.datum;

      // T7 — Absence Registration.
      const observed = new Set(t5.output.results.map((r) => r.entity_id));
      const t7 = runLayer(
        layers.t7,
        {
          expectations: t5.output.results.map((r) => ({
            entity_id: r.entity_id,
            predicted: r.expectation.predicted,
          })),
          observed,
        },
        field,
        datum,
      );
      datum = t7.datum;

      // T8 — Multi-Entity Abstraction (closes the loop).
      const t8 = runLayer(
        layers.t8,
        { others: t6.output.others, interactions: host.interactions },
        field,
        datum,
      );
      datum = t8.datum;

      // ── Appraisal step (INV-8), under the cycle's field context (§8.5) ──
      const predErrs: PredErr[] = [
        ...t5.output.results.map((r) => r.predErr),
        ...t7.output.absences,
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
        ...t5.output.results
          .filter((r) => r.predErr.delta > 0)
          .map((r) => ({ source_id: r.entity_id, e: r.predErr })),
        ...t7.output.absences.map((e) => ({ source_id: "region", e })),
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
        appraisal,
        response,
        scars,
        absences: t7.output.absences.length,
        collisionSources: [...collisionSources],
      };
    },
  };
}
