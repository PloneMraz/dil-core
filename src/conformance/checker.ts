/**
 * The conformance checker (protocol §13; stage 6).
 *
 * A system conforms iff a third party, reading only its externally verifiable
 * traces and not its internals, can confirm the seven criteria of §13. The one
 * trace is the `[event]` log (CONTEXT.md §7) — the same append-only, read-only
 * log the loop already writes. This checker reads it (plus a few observable
 * facts a third party can also see: the gate outcome, the diversity signal) and
 * scores each criterion.
 *
 * It is deliberately HONEST about the GRADE of evidence behind each verdict. §13
 * demands confirmation "from traces alone", but several criteria rest partly on
 * facts a third party CANNOT read from the log — channel separation, loop
 * closure, the absence of an action-arbiter, Mode-B holding no store handle: these
 * are guaranteed structurally (by construction/type, verified by tests), not by
 * any trace. Others are read from a declared decision (reflection), and self-
 * continuity (§7) is attributable only by a third party, never machine-certified.
 * So each criterion decomposes into `claims`, each carrying its `basis` — `trace`,
 * `structural`, `declared`, or `third-party` — and the criterion verdict rolls up
 * from them. This keeps the report from overstating what the traces alone prove:
 * an auditor can recompute a trace-only conformance by reading only the `trace`
 * claims. A per-criterion result is a valid conformance statement (§13).
 */

import type { EventLog } from "../store/event-log.js";
import type {
  EventRecord,
  LogRecord,
  CycleSealActivity,
  LayerExitActivity,
  ProvenanceActivity,
  EmissionActivity,
  CrystallizationActivity,
  ExpectationActivity,
} from "../store/resist-event.js";
import type { TaggedDatum } from "../store/tags.js";
import { isProvenanceEdge } from "../store/data-store.js";
import type { GateResult } from "../precondition/gate.js";
import { REFLECTION_MECHANISM } from "../runtime/decisions.js";
import {
  CONFORMANCE_DIVERSITY_WINDOW,
  CONFORMANCE_MIN_DISTINCT_SOURCES,
} from "./decisions.js";

export type ConformanceVerdict = "pass" | "partial" | "fail" | "unverifiable";

/**
 * HOW a claim is established — the epistemic grade §13 turns on:
 *   - `trace`       — confirmable by a third party reading only the [event] log
 *                     (the canonical §13 evidence);
 *   - `structural`  — guaranteed by construction/type, verified by tests, NOT
 *                     readable from any trace (channel separation, loop closure,
 *                     the absence of an action-arbiter, Mode-B's lack of a store
 *                     handle). A structural PASS is trusted, not trace-confirmed;
 *   - `declared`    — read from a stated DECIDE@IMPL choice or a computed gate
 *                     artifact (the reflection mechanism, the host gate);
 *   - `third-party` — attributable only from outside the loop, never machine-
 *                     certifiable (self-continuity, §7); such claims cap at
 *                     `partial` and can never carry a criterion to `pass`.
 */
export type EvidenceBasis = "trace" | "structural" | "declared" | "third-party";

/** One sub-claim of a criterion, tagged with how it is established. */
export interface ClaimCheck {
  readonly claim: string;
  readonly basis: EvidenceBasis;
  readonly verdict: ConformanceVerdict;
}

export interface CriterionResult {
  readonly id: string;
  readonly title: string;
  /** Rolled up from `claims` (single source of truth); see `rollUp`. */
  readonly verdict: ConformanceVerdict;
  /** The criterion decomposed by evidence basis (trace / structural / declared / third-party). */
  readonly claims: readonly ClaimCheck[];
  /** A human-readable summary of the criterion (the roll-up's rationale). */
  readonly detail: string;
}

export interface ConformanceReport {
  readonly results: readonly CriterionResult[];
  readonly summary: Readonly<Record<ConformanceVerdict, number>>;
}

/**
 * Observable facts a third party can read alongside the [event] log.
 *
 * There is NO self-attestation flag here: a criterion satisfied by the caller's
 * own claim is not a measurement. Diversity (criterion 7) is derived from the
 * recorded resistance-source distribution; reflection (criterion 5) is read from
 * the declared REFLECTION_MECHANISM. Only the gate outcome — itself a structured
 * result the system computed, not a bare boolean — is accepted here.
 */
export interface ObservableFacts {
  /** The precondition gate outcome (criterion 2). */
  readonly gate?: GateResult;
}

/** Build a claim. */
function claim(text: string, basis: EvidenceBasis, verdict: ConformanceVerdict): ClaimCheck {
  return { claim: text, basis, verdict };
}

/**
 * Roll a criterion's verdict up from its claims. A single failing claim fails the
 * criterion; an unverifiable claim (no traces to read) leaves it unverifiable; a
 * partial claim (limited evidence, or a third-party claim that never reaches pass)
 * caps it at partial; only when every claim passes does the criterion pass.
 */
function rollUp(claims: readonly ClaimCheck[]): ConformanceVerdict {
  if (claims.some((c) => c.verdict === "fail")) return "fail";
  if (claims.some((c) => c.verdict === "unverifiable")) return "unverifiable";
  if (claims.some((c) => c.verdict === "partial")) return "partial";
  return "pass";
}

/** Records that embed a datum + anchor (scar or cycle-seal); lean lines do not. */
type DatumBearing = EventRecord | CycleSealActivity;

function isDatumBearing(rec: LogRecord): rec is DatumBearing {
  return rec.kind === "scar" || (rec.kind === "activity" && rec.activityKind === "cycle-seal");
}
function datumOf(rec: DatumBearing): TaggedDatum {
  return rec.kind === "scar" ? rec.scar : rec.datum;
}

/**
 * Measure the accumulation signature of INV-5 from the expectation readings alone
 * (the answer to "is this an accruing self or a reloading impostor?", read by a
 * third party on a foreign system). Group the readings by entity, ordered by
 * cycle, and inspect each entity's (recurrence, confidence) series:
 *   - FAIL — the reloading signature: recurrence regressed (the count reset), or
 *     confidence fell while recurrence rose (accrual is not driving the ramp). A
 *     memoryless impostor cannot avoid one of these once it must fake a series.
 *   - PASS — an entity's confidence ramped from below saturation up to 1 as its
 *     recurrence climbed: accumulation is demonstrably observable in the trace.
 *   - PARTIAL — readings present and non-regressing, but none has yet ramped to
 *     saturation (too little recurrence to establish the ramp — never a false pass).
 */
function measureAccumulation(
  readings: readonly ExpectationActivity[],
): { verdict: ConformanceVerdict; note: string } {
  if (readings.length === 0) {
    return { verdict: "partial", note: "no expectation readings — accumulation not measurable from these traces" };
  }
  const byEntity = new Map<string, ExpectationActivity[]>();
  for (const e of readings) {
    const s = byEntity.get(e.entity) ?? [];
    s.push(e);
    byEntity.set(e.entity, s);
  }
  let sawRamp = false;
  for (const series of byEntity.values()) {
    series.sort((a, b) => a.cycleMark - b.cycleMark);
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1]!;
      const cur = series[i]!;
      if (cur.recurrence < prev.recurrence) {
        return {
          verdict: "fail",
          note: `entity "${cur.entity}" recurrence regressed ${prev.recurrence}→${cur.recurrence} — memory reset, the reloading signature (INV-5)`,
        };
      }
      // Genuine accrual: while unsaturated, a rise in recurrence MUST lift
      // confidence (confidence = f(count) monotone until it hits 1). Recurrence
      // climbing without confidence climbing — flat OR falling — is the broken/
      // faked ramp of something with no real memory behind the number.
      if (cur.recurrence > prev.recurrence && prev.confidence < 1 && cur.confidence <= prev.confidence) {
        return {
          verdict: "fail",
          note: `entity "${cur.entity}" confidence did not rise ${prev.confidence}→${cur.confidence} though recurrence climbed while unsaturated — accrual not driving the ramp (INV-5)`,
        };
      }
    }
    const confs = series.map((e) => e.confidence);
    if (Math.min(...confs) < Math.max(...confs) && Math.max(...confs) >= 1) sawRamp = true;
  }
  return sawRamp
    ? {
        verdict: "pass",
        note: "accumulation observable: an entity's confidence ramped with recurrence to saturation (INV-5) — a reloading impostor has no memory to make it climb",
      }
    : {
        verdict: "partial",
        note: "expectation readings present and non-regressing, but none has ramped to saturation yet — insufficient recurrence to establish accumulation",
      };
}

function wellFormedStore(rec: LogRecord): string | null {
  // The genesis manifest (§9): the run's constitution — protocol, schema, and the
  // declared DECIDE@IMPL configuration. It is log-level metadata, tied to no datum.
  if (rec.kind === "manifest") {
    if (typeof rec.protocol !== "string" || typeof rec.schemaVersion !== "number") {
      return "manifest record is malformed (missing protocol/schemaVersion)";
    }
    if (rec.decisions === null || typeof rec.decisions !== "object") {
      return "manifest record carries no declared decisions";
    }
    return null;
  }
  // Lean trace lines (layer-exit / provenance): only a datumId + the move.
  if (rec.kind === "activity" && rec.activityKind !== "cycle-seal") {
    if (typeof rec.datumId !== "string" || rec.datumId.length === 0) {
      return "a trace line carries no datumId";
    }
    if (typeof rec.cycleMark !== "number") return "a trace line carries no cycle-mark";
    return null;
  }
  const datum = datumOf(rec as DatumBearing);
  const anchor = (rec as DatumBearing).anchor;
  if (rec.kind === "scar") {
    if (!rec.event || typeof rec.event.source_id !== "string" || !rec.event.mismatch_kind) {
      return "record is not a ResistEvent";
    }
    if (datum.fixed?.provenance !== "scar") return "scar record embeds a non-scar datum";
  } else {
    if (typeof (rec as CycleSealActivity).activity?.cycle !== "number") return "cycle-seal carries no cycle";
    if (datum.fixed?.provenance !== "running" && datum.fixed?.provenance !== "scar") {
      return "cycle-seal embeds a datum that has not run";
    }
  }
  const f = datum.fixed;
  if (!f || typeof f.timestamp !== "number" || typeof f.floorTag !== "number") {
    return "missing fixed tags";
  }
  if (!datum.open || typeof datum.open.domain !== "string" || datum.open.domain.length === 0) {
    return "missing mandatory open tag `domain`";
  }
  if (Object.keys(datum.open).length < 3) return "fewer than three open tags";
  if (!anchor || anchor.depth == null || typeof anchor.cycle !== "number") {
    return "missing context anchor";
  }
  return null;
}

function coversAllLayers(layers: ReadonlySet<number>): boolean {
  for (let layer = 1; layer <= 8; layer++) if (!layers.has(layer)) return false;
  return true;
}

export function checkConformance(
  events: EventLog,
  facts: ObservableFacts = {},
): ConformanceReport {
  const records = events.all();
  const scars = records.filter((r): r is EventRecord => r.kind === "scar");
  const datumBearing = records.filter(isDatumBearing);
  const layerExits = records.filter(
    (r): r is LayerExitActivity => r.kind === "activity" && r.activityKind === "layer-exit",
  );
  const cycleSeals = records.filter(
    (r): r is CycleSealActivity => r.kind === "activity" && r.activityKind === "cycle-seal",
  );
  const provenanceLines = records.filter(
    (r): r is ProvenanceActivity => r.kind === "activity" && r.activityKind === "provenance",
  );
  const emissions = records.filter(
    (r): r is EmissionActivity => r.kind === "activity" && r.activityKind === "emission",
  );
  const crystallizations = records.filter(
    (r): r is CrystallizationActivity => r.kind === "activity" && r.activityKind === "crystallization",
  );
  const expectations = records.filter(
    (r): r is ExpectationActivity => r.kind === "activity" && r.activityKind === "expectation",
  );
  const results: CriterionResult[] = [];

  /** Push a criterion, rolling its verdict up from the claims. */
  function push(id: string, title: string, claims: readonly ClaimCheck[], detail: string): void {
    results.push({ id, title, verdict: rollUp(claims), claims, detail });
  }

  // C1 — Invariants (§5): no `=` emitted; four fixed tags present (trace). Channel
  // separation is structural — a third party cannot read it from the log.
  if (records.length === 0) {
    push("1", "Invariants", [claim("four fixed tags on every record", "trace", "unverifiable")], "no [event] records to read");
  } else {
    const badFixed = datumBearing.find((r) => Object.keys(datumOf(r).fixed).length !== 4);
    const badEquals = emissions.find((e) => e.register !== "↔");
    const claims: ClaimCheck[] = [
      claim("four fixed tags present on every record", "trace", badFixed ? "fail" : "pass"),
      claim("no `=` emitted — every emission register is ↔ (INV-2)", "trace", badEquals ? "fail" : "pass"),
      claim("meaning-channel and modulatory field implemented separately", "structural", "pass"),
    ];
    push(
      "1",
      "Invariants",
      claims,
      badFixed
        ? "a record lacks the four fixed tags"
        : badEquals
          ? "an emission carries register `=` — INV-2 forbids a running loop emitting `=`"
          : "no `=` in traces; four fixed tags present (channel separation verified structurally, not from traces)",
    );
  }

  // C2 — Host conditions (§4): from the gate outcome, a computed artifact derived
  // from the host's declared/probed conditions (basis `declared`).
  if (!facts.gate) {
    push("2", "Host conditions", [claim("host conditions E1–E4 and P met (gate outcome)", "declared", "unverifiable")], "no gate result supplied");
  } else {
    const probed = facts.gate.checks.filter((c) => c.basis === "probed").length;
    const declared = facts.gate.checks.length - probed;
    const qualified = facts.gate.outcome === "qualify";
    push(
      "2",
      "Host conditions",
      [claim("host conditions E1–E4 and P met (gate outcome)", "declared", qualified ? "pass" : "fail")],
      qualified
        ? `E1–E4 and P met; the loop qualified to run (${probed} probed, ${declared} declared)`
        : `clean non-start: ${facts.gate.reason}`,
    );
  }

  // C3 — Loop (§6): path T1→T8, flow-mode consistency, and emission well-formedness
  // are trace-verifiable; loop closure (INV-1) and the absence of an action-arbiter
  // are structural — verified by construction, not readable from the log.
  if (records.length === 0) {
    push("3", "Loop", [claim("every cycle datum's path covers T1→T8", "trace", "unverifiable")], "no [event] records to read");
  } else {
    // The path lives in [event]: gather each datum's layer-exit lines and check it
    // traversed T1→T8 (§13.6 — read from the log, never from a tag).
    const layersByDatum = new Map<string, Set<number>>();
    for (const le of layerExits) {
      const s = layersByDatum.get(le.datumId) ?? new Set<number>();
      s.add(le.layer);
      layersByDatum.set(le.datumId, s);
    }
    const incomplete = cycleSeals.find(
      (r) => !coversAllLayers(layersByDatum.get(r.datumId) ?? new Set<number>()),
    );
    const flowRecorded = datumBearing.every((r) => typeof datumOf(r).open.flow === "string");
    const flowInconsistent = datumBearing.find((r) => {
      const flow = datumOf(r).open.flow;
      const mark = datumOf(r).fixed.cycleMark;
      if (flow === undefined || mark === null) return false;
      return mark === 0 ? flow !== "single-threaded" : flow !== "multi-stream";
    });
    // §13.3 (link 5, §6.4): every emission carries register ↔ and names a valid
    // issuing layer (1–8). The ABSENCE of an action-arbiter is not readable from
    // the trace (absence of evidence) — it is structural, like channel separation.
    const badEmission = emissions.find(
      (e) => e.register !== "↔" || !(e.issuingLayer >= 1 && e.issuingLayer <= 8),
    );
    const claims: ClaimCheck[] = [
      claim("every cycle datum's path covers T1→T8 (from layer-exit lines)", "trace", incomplete ? "fail" : "pass"),
      claim("recorded flow mode matches cycle-mark (0 single-threaded, 1+ multi-stream)", "trace", flowInconsistent ? "fail" : "pass"),
      claim("every emission carries register ↔ and a valid issuing layer (1–8)", "trace", badEmission ? "fail" : "pass"),
      claim("the six links close back on themselves (INV-1 topology)", "structural", "pass"),
      claim("no internal action-arbiter — conflict collided as a ResistEvent (§6.4)", "structural", "pass"),
    ];
    push(
      "3",
      "Loop",
      claims,
      incomplete
        ? `a cycle datum's layer-exit lines do not cover T1–T8 (${incomplete.datumId})`
        : flowInconsistent
          ? `a record's recorded flow mode contradicts its cycle-mark (cycle ${datumOf(flowInconsistent).fixed.cycleMark}: ${datumOf(flowInconsistent).open.flow})`
          : badEmission
            ? `an emission is malformed (register ${badEmission.register}, issuing layer ${badEmission.issuingLayer}) — must be ↔ from a layer 1–8`
            : `every cycle datum's path (from [event] layer-exit lines) covers T1→T8; ${emissions.length} emission(s), each register ↔ naming an issuing layer, no action-arbiter; ${
                flowRecorded
                  ? "flow mode recorded and consistent (cycle-0 single-threaded, cycle-1+ multi-stream)"
                  : "flow mode not recorded in these traces"
              }`,
    );
  }

  // C4 — Self (§7): accrual and the one-time crystallization are trace-verifiable;
  // self-continuity is attributable only by a third party (never machine-certified).
  if (records.length === 0) {
    push("4", "Self", [claim("state accrues — cycle-marks non-decreasing (INV-5)", "trace", "unverifiable")], "no [event] records to read");
  } else {
    const marks = datumBearing.map((r) => datumOf(r).fixed.cycleMark ?? -1);
    const nonDecreasing = marks.every((m, i) => i === 0 || m >= marks[i - 1]!);
    // §7 crystallization: T2 draws the self/environment distinction ONCE, at the
    // T2 of cycle-0. The trace must show it as a one-time act — at most one
    // crystallization record, and it may only mark cycle 0 (the from-within
    // standpoint begins there; a later "re-crystallization" would fabricate a
    // discontinuity the self never underwent). The record is lean by
    // construction: it carries no self datum, so it asserts the *act* of
    // distinguishing, never a persistent/continuing self (the §7 forbidden claim).
    const crystallizedOnce = crystallizations.length <= 1;
    const crystallizedAtZero = crystallizations.every((c) => c.cycleMark === 0);
    const crystallizationOk = crystallizedOnce && crystallizedAtZero;
    const crystallizationNote =
      crystallizations.length === 0
        ? "; no crystallization recorded yet (cycle-0 T2 not reached in these traces)"
        : crystallizationOk
          ? "; the self/environment distinction crystallized once at cycle-0 (§7), recorded as an act — no persistent self is asserted"
          : !crystallizedOnce
            ? `; self/environment distinction drawn ${crystallizations.length} times — crystallization is one-time (§7)`
            : "; a crystallization record marks a cycle other than 0 — the distinction is drawn at cycle-0 T2 (§7)";
    // INV-5 accumulation, MEASURED from the expectation ramp — not the weak
    // cycle-mark proxy (which a reloading impostor also passes) and not a self-
    // declared guard (which trusts the declarer). This is the trace-verifiable
    // consequence a third party can measure on a foreign system.
    const accum = measureAccumulation(expectations);
    const claims: ClaimCheck[] = [
      claim("cycle-marks non-decreasing (basic monotonicity)", "trace", nonDecreasing ? "pass" : "partial"),
      claim("accumulation observable — confidence ramps with recurrence to saturation (INV-5)", "trace", accum.verdict),
      claim("self/environment distinction crystallized once, at cycle-0 (§7)", "trace", crystallizationOk ? "pass" : "fail"),
      claim("no internal claim of measured continuity (§7)", "structural", "pass"),
      claim("self-continuity — attributable only by a third party (§7)", "third-party", "partial"),
    ];
    push(
      "4",
      "Self",
      claims,
      (nonDecreasing
        ? "state accrues (cycle-marks non-decreasing, INV-5), no internal continuity claim; self-continuity itself is attributable only by a third party (§7)"
        : "cycle-marks not monotonic — either a recovery fork re-entered earlier cycles (cross-check the commit DAG: fork markers carry recoveredFrom) or accrual is suspect") +
        crystallizationNote +
        "; " + accum.note,
    );
  }

  // C5 — Resistance (§8): source diversity and registered returns are trace-
  // verifiable; Mode-B holding no store handle is structural; the reflection
  // mechanism is read from a declared decision.
  if (records.length === 0) {
    push("5", "Resistance", [claim("resistance-source diversity in traces (Mode-A not pure)", "trace", "unverifiable")], "no [event] records to read");
  } else {
    const sources = new Set(scars.map((r) => r.event.source_id));
    const modeBEvidence = sources.size >= 2;
    // Reflection status is read from the declared decision, not a caller flag.
    const reflection = REFLECTION_MECHANISM !== "DEFERRED";
    // §8.4 "Mode-B returns; it does not write": the source and the reflection
    // reader hold only a read-only [event] view (ReadableEventLog) and the
    // HostSource has no store handle — a structural, type-level guarantee (like
    // channel separation), not read from traces. Its returns must be REGISTERED
    // rather than left to pass (pure Mode-A): a registered return is a scar or an
    // observed entity in the trace.
    const returnsRegistered =
      scars.length > 0 || cycleSeals.some((s) => s.activity.observed.length > 0);
    const claims: ClaimCheck[] = [
      claim("resistance-source diversity in traces (Mode-A not pure)", "trace", modeBEvidence ? "pass" : "partial"),
      claim("Mode-B returns registered, not left to pass (§8.4)", "trace", returnsRegistered ? "pass" : "partial"),
      claim("Mode-B writes to no store — read-only view, no store handle (§8.4)", "structural", "pass"),
      claim("reflection wired as external ENV_PUSHED input (§8.4, tag E)", "declared", reflection ? "pass" : "partial"),
    ];
    push(
      "5",
      "Resistance",
      claims,
      `${sources.size} distinct resistance source(s) in traces` +
        (modeBEvidence ? " (Mode-A not pure)" : " (limited diversity)") +
        (returnsRegistered
          ? "; returns registered (not left to pass)"
          : "; returns not registered — the loop may be letting returns pass (pure Mode-A)") +
        "; Mode-B writes to no store (structural: read-only view, no store handle)" +
        (reflection ? "; reflection wired" : "; reflection is DEFERRED (§8.4, tag E)"),
    );
  }

  // C6 — Store (§9): full trace-side verification of every record.
  if (records.length === 0) {
    push("6", "Store", [claim("every record well-formed (tags, anchor, ResistEvent)", "trace", "unverifiable")], "no [event] records to read");
  } else {
    let firstProblem: string | null = null;
    for (const rec of records) {
      const problem = wellFormedStore(rec);
      if (problem) {
        firstProblem = problem;
        break;
      }
    }
    // §13.6: every cycle leaves an activity record — coverage must be
    // contiguous from cycle 0 to the highest cycle seen.
    const activityCycles = new Set(cycleSeals.map((r) => r.activity.cycle));
    let coverageGap: number | null = null;
    if (activityCycles.size === 0) {
      coverageGap = 0;
    } else {
      const max = Math.max(...activityCycles);
      for (let c = 0; c <= max; c++) {
        if (!activityCycles.has(c)) {
          coverageGap = c;
          break;
        }
      }
    }
    // §13.6: provenance moves only along the edges of the §9 graph (so nothing
    // ever returns to `prior` — no edge targets it), and `prior` is entered once
    // (a datum has at most one prior→running).
    const badEdge = provenanceLines.find((r) => !isProvenanceEdge(r.from, r.to));
    const priorEntries = new Map<string, number>();
    for (const r of provenanceLines) {
      if (r.from === "prior") priorEntries.set(r.datumId, (priorEntries.get(r.datumId) ?? 0) + 1);
    }
    const doubleEntry = [...priorEntries.entries()].find(([, n]) => n > 1);
    const claims: ClaimCheck[] = [
      claim("every record well-formed — 4 fixed + ≥3 open tags incl domain + anchor", "trace", firstProblem ? "fail" : "pass"),
      claim("every cycle left an activity record (contiguous coverage)", "trace", coverageGap !== null ? "fail" : "pass"),
      claim("provenance moves only along the §9 graph edges", "trace", badEdge ? "fail" : "pass"),
      claim("`prior` entered once, never re-entered (§9)", "trace", doubleEntry ? "fail" : "pass"),
    ];
    push(
      "6",
      "Store",
      claims,
      firstProblem
        ? `a record failed: ${firstProblem}`
        : coverageGap !== null
          ? `activity-record coverage gap: no activity record for cycle ${coverageGap}`
          : badEdge
            ? `illegal provenance move in the trace: ${badEdge.from} → ${badEdge.to} (${badEdge.datumId})`
            : doubleEntry
              ? `datum ${doubleEntry[0]} entered \`prior\` more than once; prior is a one-way entry (§9)`
              : "scars carry the ResistEvent and every cycle left an activity record; provenance moves only along the §9 graph edges (prior entered once); all records carry four fixed tags, ≥3 open tags incl domain, and a context anchor; the log is append-only with read-only records",
    );
  }

  // C7 — Failure signals (§11): resistance-source diversity, DERIVED from the
  // [event] log's source_id distribution — never from a caller's claim. Over the
  // most recent CONFORMANCE_DIVERSITY_WINDOW records: enough evidence + diverse
  // → pass; enough evidence + collapsed → fail (diversity loss established);
  // not enough evidence to establish diversity → partial (never pass).
  {
    const window = scars.slice(-CONFORMANCE_DIVERSITY_WINDOW);
    if (window.length < CONFORMANCE_DIVERSITY_WINDOW) {
      push(
        "7",
        "Failure signals",
        [claim("resistance-source diversity established from traces", "trace", "partial")],
        `insufficient evidence: ${window.length} recorded collision(s) < window ${CONFORMANCE_DIVERSITY_WINDOW}; diversity cannot be established from traces`,
      );
    } else {
      const distinct = new Set(window.map((r) => r.event.source_id)).size;
      const diverse = distinct >= CONFORMANCE_MIN_DISTINCT_SOURCES;
      push(
        "7",
        "Failure signals",
        [claim("resistance-source diversity established from traces", "trace", diverse ? "pass" : "fail")],
        diverse
          ? `resistance-source diversity established from traces: ${distinct} distinct sources over the last ${CONFORMANCE_DIVERSITY_WINDOW} records`
          : `diversity-loss established from traces: only ${distinct} distinct source(s) over the last ${CONFORMANCE_DIVERSITY_WINDOW} records (< ${CONFORMANCE_MIN_DISTINCT_SOURCES})`,
      );
    }
  }

  const summary: Record<ConformanceVerdict, number> = { pass: 0, partial: 0, fail: 0, unverifiable: 0 };
  for (const r of results) summary[r.verdict] += 1;

  return { results, summary };
}
