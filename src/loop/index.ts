/**
 * The loop — stage 4 of the build order (protocol §6).
 *
 * 4a: the shared types of §6.1 and the DECIDE@IMPL tag-A representation choices.
 */

export {
  SIGNAL_PAYLOAD_REPR,
  INFOUNIT_CONTENT_REPR,
  REF_FRAME_REPR,
  MATCHING_WINDOW,
  STABILITY_THRESHOLD,
  BASELINE_WINDOW,
  SUFFICIENT_RECURRENCE,
  EXPECTATION_UPDATE_LAW,
  APPRAISAL_ANCHOR_KIND,
  APPRAISAL_ANCHOR_ID,
  GLOB_MOD_REPRESENTATION,
  GLOB_MOD_UPDATE_LAW,
  MULTI_STREAM_SCHEDULE,
} from "./decisions.js";

export * from "./layers/index.js";

export { appraise, type AppraisalInput } from "./appraisal.js";

export {
  createCycle,
  type Cycle,
  type CycleDeps,
  type CycleResult,
  type DriverState,
  type FlowMode,
  type HostCycleInput,
  type Layers,
} from "./cycle.js";

export { MultiStreamError } from "./gathers.js";

export { createGlobMod, GlobModError, type GlobMod } from "./glob-mod.js";

export {
  validateLayerSpec,
  runLayer,
  isSnapshottable,
  type LayerSpec,
  type LayerRun,
  type Snapshottable,
} from "./layer.js";

export { createMeaningChannel, type MeaningChannel } from "./meaning-channel.js";

export { canonicalLoopTopology, validateLoopTopology } from "./topology.js";

// Only the loop's OWN new shared types are surfaced here; the borrowed shapes
// (LayerIndex, AgencyTag, LayerTrace, ResistEvent, MismatchKind) are already
// exported by the invariants/store rings, so re-exporting them would collide
// at the root barrel.
export type {
  RefFrame,
  Signal,
  InfoUnit,
  ActivityEnvironment,
  HistoryWindow,
  Expectation,
  Sign,
  PredErr,
  OtherModel,
  RelValue,
  SocialEdge,
  ModField,
  Appraisal,
} from "./types.js";
