/**
 * Render a ConformanceReport as a human-readable table (stage 6).
 *
 * Read-only presentation, in the spirit of the store inspector: it turns the
 * per-criterion verdicts into a table a third party can read at a glance, and —
 * faithful to §13's "from traces alone" stance — surfaces the EVIDENCE BASIS of
 * each claim, so a reader sees which verdicts the [event] log confirms and which
 * rest on structural / declared / third-party guarantees it cannot read.
 */

import type { ConformanceReport, ConformanceVerdict, EvidenceBasis } from "./checker.js";

const MARK: Record<ConformanceVerdict, string> = {
  pass: "PASS",
  partial: "PART",
  fail: "FAIL",
  unverifiable: "N/V ",
};

const CLAIM_MARK: Record<ConformanceVerdict, string> = {
  pass: "✓",
  partial: "~",
  fail: "✗",
  unverifiable: "?",
};

const BASES: readonly EvidenceBasis[] = ["trace", "structural", "declared", "third-party"];

export function renderConformance(report: ConformanceReport): string {
  const s = report.summary;
  const header = `Conformance (§13) — ${s.pass} pass, ${s.partial} partial, ${s.fail} fail, ${s.unverifiable} n/v`;

  // Evidence line: how many claims of each basis, and how many criteria are
  // confirmable from the [event] log ALONE (every claim `trace`) — the honest
  // answer to §13's "reading only its externally verifiable traces".
  const tally: Record<EvidenceBasis, number> = { trace: 0, structural: 0, declared: 0, "third-party": 0 };
  for (const r of report.results) for (const c of r.claims) tally[c.basis] += 1;
  const traceOnly = report.results.filter(
    (r) => r.claims.length > 0 && r.claims.every((c) => c.basis === "trace"),
  ).length;
  const evidence =
    `  Evidence — ${BASES.map((b) => `${tally[b]} ${b}`).join(", ")} claim(s); ` +
    `${traceOnly}/${report.results.length} criteria confirmable from [event] alone`;

  const lines = report.results.flatMap((r) => {
    const head = `  [${MARK[r.verdict]}] §13.${r.id} ${r.title}: ${r.detail}`;
    const claims =
      "         " +
      r.claims.map((c) => `${CLAIM_MARK[c.verdict]} [${c.basis}] ${c.claim}`).join("  ·  ");
    return [head, claims];
  });

  return [header, evidence, ...lines].join("\n");
}
