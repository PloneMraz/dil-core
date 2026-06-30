/**
 * Invariants — the eight hard runtime guards (protocol §5).
 *
 * Stage 2 of the build order. Everything else runs *inside* these.
 */

export { InvariantViolation, halt, type InvariantId } from "./violation.js";

export type {
  LayerIndex,
  Register,
  RunningOutput,
  AgencyTag,
  Change,
  ReferredUnit,
  TemporalWrite,
  LoopEdge,
  GlobModUpdate,
  AppraisalCriteria,
} from "./types.js";

export {
  assertClosedLoop,
  assertCorrelational,
  assertMeaningChannelOrder,
  assertReferred,
  assertAccrual,
  assertAgencyClassified,
  assertGlobModUpdate,
  assertAppraisalIndependence,
} from "./guards.js";
