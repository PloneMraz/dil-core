/**
 * Declared DECIDE@IMPL choices for the runtime / requisition ring (protocol §12).
 *
 * This is the outermost ring — where DIL meets the host (CONTEXT.md §3, §5). It
 * declares the live Mode-B source (tag D), the reflection mechanism (tag E), and
 * the diversity-loss thresholds (§11, conformance criterion 7).
 */

/** DECIDE@IMPL tag D — the identity of the live Mode-B source (protocol §8.4). */
export const MODE_B_SOURCE = "host-source (live external input the agent does not control)" as const;
/**
 * Rationale: for the minimal host the live Mode-B source is the `HostSource` the
 * daemon requisitions — a user, another agent, or any region that returns and
 * can resist. This replaces the static appraisal anchor (loop tag C) as the real
 * brake: resistance enters from outside the loop, not self-generated. A
 * compliant source that never resists is useless however much it supplies (the
 * B-source rule, §8.4); the diversity monitor below flags its loss.
 */

/** DECIDE@IMPL tag E — the read-collision-into-coordinates mechanism for reflection (§8.4). */
export const REFLECTION_MECHANISM: string =
  "event-coordinate reading (runtime/reflection.ts): a third party reads a recorded collision out of the [event] log into coordinates (collisionCoordinates/formReading) and returns it through a declared T3 channel (reflectionSignal + reflectionTransducer); the agency-gate classifies it ENV_PUSHED";
/**
 * Rationale: the coordinate system is the [event] log itself — the one trace a
 * third party already reads (§13); a coordinate addresses one recorded
 * collision (index, cycle, source, mismatch kind). formReading refuses a
 * coordinate that references no real record: a reflection cannot be fabricated
 * about a collision that never happened. WHO reads (a user, another agent, a
 * critic service — which may itself consult external data such as the web)
 * stays deliberately deployment-open, like tag D. No internal self-reflection
 * faculty exists, per §8.4 ("it cannot self-reflect on call"). Typed `string`
 * (not a literal) so the conformance checker's "is it still DEFERRED?"
 * comparison stays a genuine runtime read.
 */

/** DECIDE@IMPL — diversity-loss monitor window and minimum source count (§11). */
export const DIVERSITY_WINDOW = 8;
export const MIN_DIVERSITY_SOURCES = 2;
/**
 * Rationale (tunable, not derived): over the last DIVERSITY_WINDOW cycles, if the
 * resistance-source set holds fewer than MIN_DIVERSITY_SOURCES distinct sources,
 * the daemon emits the diversity-loss signal (conformance criterion 7). This
 * catches both single-source domination (a Sybil-ish flood, §11) and resistance
 * depletion (Mode-A collapse risk). The cure — admission control, source-diversity
 * enforcement — lives outside the loop; the protocol carries only the signal.
 */
