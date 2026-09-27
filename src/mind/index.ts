/**
 * The mind — the thinking, seated at the loop's seams; the model is its engine
 * (CONTEXT.md §5a). Not the host, and not DIL: DIL is the mechanism the data
 * runs by between the host and the mind.
 */
export { createMind, MIND_TAGS, type Mind, type MindReport } from "./mind.js";
export {
  standingModel,
  type Model,
  type Situation,
  type Expected,
  type Arrival,
  type Context,
  type Write,
  type Thinking,
  type Proposal,
} from "./model.js";
export { MIND_THOUGHTS_PER_CYCLE, MIND_SEAT } from "./decisions.js";
