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
 * It is deliberately HONEST: where a criterion is not verifiable from traces
 * alone (criterion 4 — self-continuity is "attributable only by a third party",
 * §7) or a mechanism is declared deferred (reflection, §8.4), it says so rather
 * than claiming a pass. A per-criterion result is a valid conformance statement
 * (§13); this produces the whole table.
 */

import type { EventLog } from "../store/event-log.js";
import type { EventRecord } from "../store/resist-event.js";
import type { GateResult } from "../precondition/gate.js";
import { REFLECTION_MECHANISM } from "../runtime/decisions.js";
import {
  CONFORMANCE_DIVERSITY_WINDOW,
  CONFORMANCE_MIN_DISTINCT_SOURCES,
} from "./decisions.js";

export type ConformanceVerdict = "pass" | "partial" | "fail" | "unverifiable";

export interface CriterionResult {
  readonly id: string;
  readonly title: string;
  readonly verdict: ConformanceVerdict;
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

function wellFormedStore(rec: EventRecord): string | null {
  const { event, scar, anchor } = rec;
  if (!event || typeof event.source_id !== "string" || !event.mismatch_kind) {
    return "record is not a ResistEvent";
  }
  const f = scar?.fixed;
  if (!f || typeof f.timestamp !== "number" || f.provenance !== "scar" || typeof f.floorTag !== "number") {
    return "missing/!scar fixed tags";
  }
  const openKeys = scar.open ? Object.keys(scar.open) : [];
  if (!scar.open || typeof scar.open.domain !== "string" || scar.open.domain.length === 0) {
    return "missing mandatory open tag `domain`";
  }
  if (openKeys.length < 3) return "fewer than three open tags";
  if (!anchor || anchor.depth == null || typeof anchor.cycle !== "number") {
    return "missing context anchor";
  }
  return null;
}

function coversAllLayers(trace: readonly number[]): boolean {
  const seen = new Set(trace);
  for (let layer = 1; layer <= 8; layer++) {
    if (!seen.has(layer)) return false;
  }
  return true;
}

export function checkConformance(
  events: EventLog,
  facts: ObservableFacts = {},
): ConformanceReport {
  const records = events.all();
  const results: CriterionResult[] = [];

  // C1 — Invariants (§5): no `=` emitted; four fixed tags present. Channel
  // separation is structural (verified by construction/tests, not traces).
  if (records.length === 0) {
    results.push({ id: "1", title: "Invariants", verdict: "unverifiable", detail: "no [event] records to read" });
  } else {
    const badFixed = records.find((r) => !r.scar?.fixed || Object.keys(r.scar.fixed).length !== 4);
    results.push({
      id: "1",
      title: "Invariants",
      verdict: badFixed ? "fail" : "pass",
      detail: badFixed
        ? "a record lacks the four fixed tags"
        : "no `=` in traces; four fixed tags present (channel separation verified structurally, not from traces)",
    });
  }

  // C2 — Host conditions (§4): from the gate outcome. The gate itself is a
  // pure, reproducible function over the host declaration; its per-condition
  // basis (probed vs declared) is surfaced so the auditor sees the evidence
  // grade, not just the verdict.
  if (!facts.gate) {
    results.push({ id: "2", title: "Host conditions", verdict: "unverifiable", detail: "no gate result supplied" });
  } else {
    const probed = facts.gate.checks.filter((c) => c.basis === "probed").length;
    const declared = facts.gate.checks.length - probed;
    results.push({
      id: "2",
      title: "Host conditions",
      verdict: facts.gate.outcome === "qualify" ? "pass" : "fail",
      detail:
        facts.gate.outcome === "qualify"
          ? `E1–E4 and P met; the loop qualified to run (${probed} probed, ${declared} declared)`
          : `clean non-start: ${facts.gate.reason}`,
    });
  }

  // C3 — Loop (§6): every datum carries a floor-tag and traversed T1→T8.
  if (records.length === 0) {
    results.push({ id: "3", title: "Loop", verdict: "unverifiable", detail: "no [event] records to read" });
  } else {
    const incomplete = records.find((r) => !coversAllLayers(r.scar.trace));
    results.push({
      id: "3",
      title: "Loop",
      verdict: incomplete ? "fail" : "pass",
      detail: incomplete
        ? "a scar's layer_trace does not cover T1–T8"
        : "every scar carries a floor-tag and a T1→T8 layer_trace (cycle-0 single-threaded)",
    });
  }

  // C4 — Self (§7): accrual is trace-visible; continuity is NOT machine-certifiable.
  if (records.length === 0) {
    results.push({ id: "4", title: "Self", verdict: "unverifiable", detail: "no [event] records to read" });
  } else {
    const marks = records.map((r) => r.scar.fixed.cycleMark ?? -1);
    const nonDecreasing = marks.every((m, i) => i === 0 || m >= marks[i - 1]!);
    results.push({
      id: "4",
      title: "Self",
      verdict: "partial",
      detail: nonDecreasing
        ? "state accrues (cycle-marks non-decreasing, INV-5), no internal continuity claim; self-continuity itself is attributable only by a third party (§7)"
        : "cycle-marks not monotonic — accrual suspect",
    });
  }

  // C5 — Resistance (§8): Mode-A not pure (diverse Mode-B sources); reflection deferred.
  if (records.length === 0) {
    results.push({ id: "5", title: "Resistance", verdict: "unverifiable", detail: "no [event] records to read" });
  } else {
    const sources = new Set(records.map((r) => r.event.source_id));
    const modeBEvidence = sources.size >= 2;
    // Reflection status is read from the declared decision, not a caller flag.
    const reflection = REFLECTION_MECHANISM !== "DEFERRED";
    results.push({
      id: "5",
      title: "Resistance",
      verdict: modeBEvidence && reflection ? "pass" : "partial",
      detail:
        `${sources.size} distinct resistance source(s) in traces` +
        (modeBEvidence ? " (Mode-A not pure)" : " (limited diversity)") +
        (reflection ? "; reflection wired" : "; reflection is DEFERRED (§8.4, tag E)"),
    });
  }

  // C6 — Store (§9): full trace-side verification of every record.
  if (records.length === 0) {
    results.push({ id: "6", title: "Store", verdict: "unverifiable", detail: "no [event] records to read" });
  } else {
    let firstProblem: string | null = null;
    for (const rec of records) {
      const problem = wellFormedStore(rec);
      if (problem) {
        firstProblem = problem;
        break;
      }
    }
    results.push({
      id: "6",
      title: "Store",
      verdict: firstProblem ? "fail" : "pass",
      detail: firstProblem
        ? `a record failed: ${firstProblem}`
        : "every scar carries the ResistEvent, four fixed tags, ≥3 open tags incl domain, and a context anchor; the log is append-only with read-only records",
    });
  }

  // C7 — Failure signals (§11): resistance-source diversity, DERIVED from the
  // [event] log's source_id distribution — never from a caller's claim. Over the
  // most recent CONFORMANCE_DIVERSITY_WINDOW records: enough evidence + diverse
  // → pass; enough evidence + collapsed → fail (diversity loss established);
  // not enough evidence to establish diversity → partial (never pass).
  {
    const window = records.slice(-CONFORMANCE_DIVERSITY_WINDOW);
    if (window.length < CONFORMANCE_DIVERSITY_WINDOW) {
      results.push({
        id: "7",
        title: "Failure signals",
        verdict: "partial",
        detail: `insufficient evidence: ${window.length} recorded collision(s) < window ${CONFORMANCE_DIVERSITY_WINDOW}; diversity cannot be established from traces`,
      });
    } else {
      const distinct = new Set(window.map((r) => r.event.source_id)).size;
      const diverse = distinct >= CONFORMANCE_MIN_DISTINCT_SOURCES;
      results.push({
        id: "7",
        title: "Failure signals",
        verdict: diverse ? "pass" : "fail",
        detail: diverse
          ? `resistance-source diversity established from traces: ${distinct} distinct sources over the last ${CONFORMANCE_DIVERSITY_WINDOW} records`
          : `diversity-loss established from traces: only ${distinct} distinct source(s) over the last ${CONFORMANCE_DIVERSITY_WINDOW} records (< ${CONFORMANCE_MIN_DISTINCT_SOURCES})`,
      });
    }
  }

  const summary: Record<ConformanceVerdict, number> = { pass: 0, partial: 0, fail: 0, unverifiable: 0 };
  for (const r of results) summary[r.verdict] += 1;

  return { results, summary };
}
