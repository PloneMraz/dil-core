/**
 * Declared DECIDE@IMPL choices for the conformance checker (protocol §12, §13).
 *
 * The checker verifies criteria from evidence a third party can read — the
 * `[event]` log — never from a caller's own claim. Criterion 7 (§13.7,
 * diversity-loss) is therefore DERIVED from the recorded resistance-source
 * distribution, not attested. This file declares the derivation rule.
 */

/** Window (most-recent [event] records) over which resistance-source diversity is judged. */
export const CONFORMANCE_DIVERSITY_WINDOW = 8;
/**
 * HONEST STATUS: a tunable starting value, NOT a derived constant (tag B is
 * "not yet derived"). Chosen to match the runtime diversity monitor's window so
 * the checker judges the same rule the daemon acts on. If the run has fewer than
 * this many recorded collisions, diversity cannot be established from evidence
 * and the criterion renders `partial` — never `pass`.
 */

/** Minimum distinct resistance sources required over the window to count as diverse. */
export const CONFORMANCE_MIN_DISTINCT_SOURCES = 2;
/**
 * HONEST STATUS: tunable, not derived. Below this many distinct sources over a
 * full window, the resistance-source set has lost diversity (single-source
 * domination or depletion) and criterion 7 renders `fail`. At or above it, with
 * enough evidence, it renders `pass`.
 */
