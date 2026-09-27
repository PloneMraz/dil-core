/**
 * What the mind declares (protocol §12: a constant a conforming implementation
 * fills MUST be declared, never invented silently).
 */

/** DECIDE@IMPL tag B — how many times a cycle the mind thinks on failed expectations, at NEUTRAL alertness. */
export const MIND_THOUGHTS_PER_CYCLE = 1;
/**
 * Rationale: a mind thinks on what comes back against it, not on every arrival,
 * and one thought a cycle is the least that lets every cycle's collision reach
 * it. The field's alertness shifts it (loop/decisions.ts FIELD_READING_LAW):
 * rounded, 1 at NEUTRAL and below, 2 at full alertness. Tunable, NOT derived.
 */

/** DECIDE@IMPL — where the mind sits. */
export const MIND_SEAT =
  "T5's rule (PredictRule): every arrival reaches it; it expects, looks, thinks, asks, writes, and commands as T5's test" as const;
/**
 * Rationale: §6 leaves the update law to the implementation and §6.4 names the
 * emissions T5 presupposes (the query, the test). The mind sits where the
 * layers leave their thinking open; it is not a layer and adds none.
 */
