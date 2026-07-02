/**
 * Conformance — stage 6 of the build order (protocol §13).
 *
 * Reads the [event] log (the one trusted trace) plus observable facts and scores
 * the seven §13 criteria into a per-criterion pass/fail table.
 */

export {
  checkConformance,
  type ConformanceVerdict,
  type CriterionResult,
  type ConformanceReport,
  type ObservableFacts,
} from "./checker.js";

export { renderConformance } from "./render.js";
