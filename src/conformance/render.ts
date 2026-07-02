/**
 * Render a ConformanceReport as a human-readable table (stage 6).
 *
 * Read-only presentation, in the spirit of the store inspector: it turns the
 * per-criterion verdicts into a table a third party can read at a glance.
 */

import type { ConformanceReport, ConformanceVerdict } from "./checker.js";

const MARK: Record<ConformanceVerdict, string> = {
  pass: "PASS",
  partial: "PART",
  fail: "FAIL",
  unverifiable: "N/V ",
};

export function renderConformance(report: ConformanceReport): string {
  const lines = report.results.map(
    (r) => `  [${MARK[r.verdict]}] §13.${r.id} ${r.title}: ${r.detail}`,
  );
  const s = report.summary;
  const header = `Conformance (§13) — ${s.pass} pass, ${s.partial} partial, ${s.fail} fail, ${s.unverifiable} n/v`;
  return [header, ...lines].join("\n");
}
