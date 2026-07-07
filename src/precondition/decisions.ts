/**
 * Declared DECIDE@IMPL choices for the precondition gate (protocol §4, §12).
 *
 * The gate is declaration-based BY DESIGN: requisition means the host declares
 * where its faculties are and DIL threads through (AGENTS.md); at gate time no
 * loop has run, so there is no trace evidence to derive from. This file
 * declares the one refinement layered on top: where a condition is mechanically
 * probeable *before* the loop runs, the gate probes it and grades the result
 * `probed`; where it is not, the result stays `declared` — with the reason
 * stated here rather than left implicit. A false declaration is not silent
 * either way: it surfaces in the [event] traces afterwards and fails the
 * evidence-based conformance criteria (§13.3–§13.7).
 */

/** Conditions the gate probes when the host declares a probe handle. */
export const PROBEABLE_CONDITIONS = ["E3", "E4", "P_b"] as const;
/**
 * Why ONLY these:
 *   - E3 / P(b) — persistence is a hold-and-return mechanism: writable and
 *     readable back before the loop runs, through the handle the host declares.
 *   - E4 — trace readability is likewise exercisable: leave a marker through
 *     the declared trace handle and read it back.
 * Why the others stay declaration-based (honest limits, not oversights):
 *   - E2 — a silent probe window proves nothing: idle stretches are the
 *     DEFAULT of an informational setting (§3), so silence at probe time is
 *     not a void field; unbroken silence is only observable in a running loop.
 *   - P(c) — testing self-wipe-on-mismatch requires *inducing* a mismatch,
 *     i.e. running the loop; the gate must stay pre-run.
 *   - E1, P(a) — structural capacities (a boundary; the ability to emit),
 *     not mechanically exercisable before anything runs.
 */

/** DECIDE@IMPL — the E3/P(b) probe design. */
export const E3_PROBE_DESIGN =
  "marker round-trip through the declared store handle: write a per-run nonce, read it back, compare; verifies hold-and-return within the process, NOT restart durability (that is the sink's concern)" as const;

/** DECIDE@IMPL — the E4 probe design. */
export const E4_PROBE_DESIGN =
  "leave a per-run nonce marker through the declared trace handle, then read the trace back and require the marker to be present" as const;

/**
 * The probe marker uses a per-run nonce (timestamp + random suffix) rather than
 * a fixed value, so a stale value from an earlier run — or a handle that echoes
 * canned values — cannot fake a pass. Mechanism, not a tunable constant.
 */
export const PROBE_NONCE_PREFIX = "dil-probe" as const;
