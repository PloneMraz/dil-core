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

/** DECIDE@IMPL tag E — the mechanism by which a third party's reading enters (§8.4). */
export const REFLECTION_MECHANISM: string =
  "trace-pointed reading (runtime/reflection.ts): a third party, from its own lens, points at a cycle the agent's [event] trace recorded (traceCycles/formReading) with its view of where the agent drifted, and returns it through a declared T3 channel (reflectionSignal + reflectionTransducer); the agency-gate classifies it ENV_PUSHED. The reading is the reader's view, not the agent's recorded collision retold";
/**
 * Rationale: the coordinate system is the agent's [event] trace — the one trace
 * a third party already reads (§13) — and a coordinate is a cycle it recorded.
 * formReading refuses a cycle the trace never recorded: a reader cannot point
 * at a place that is not there. The place need not hold a scar: a collision the
 * agent recorded is one it already authored, and a source relaying it back is
 * compliant and re-authorable (§8.3, §8.4); the drift a reader is for is the
 * kind the agent does not see (§8.2). When a reading collides, the mismatch is
 * between the agent and the reader. The reading carries no verdict (§9). WHO
 * reads (a user, another agent, a critic service, a piece of code judging the
 * agent's behaviour) and with what lens stays deliberately deployment-open,
 * like tag D. No internal self-reflection faculty exists, per §8.4 ("it cannot
 * self-reflect on call"). Typed `string` (not a literal) so the conformance
 * checker's "is it still DEFERRED?" comparison stays a genuine runtime read.
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
