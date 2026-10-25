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
  FIELD_CARRY,
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

// The record's view (v0.3.9 §9, "Reading the record"): the open link through
// which the rule reads `[event]`, every cycle — §10's resistance-retrieval
// channel.
export { createRecordView, recordSeq } from "./record-view.js";

// Recollection: one law over the record — what the region gave last time, as an
// expectation and as nothing else.
export {
  recall,
  recollecting,
  RECOLLECTION_LAYER,
  RECOLLECTION_PURPOSE,
  type RecollectionOptions,
} from "./recollection.js";

// The T3 query answered from the agent's own store (§6.4, §9 open layer): the
// character recalls on a cue; the store never pours into the loop.
export { answerQuery, matchesCue, type StoreReturn } from "./store-query.js";

export { createGlobMod, GlobModError, type GlobMod } from "./glob-mod.js";

export {
  validateLayerSpec,
  runLayer,
  isSnapshottable,
  type ContributeFn,
  type LayerContribution,
  type LayerSpec,
  type LayerRun,
  type Snapshottable,
} from "./layer.js";

export { createMeaningChannel, type MeaningChannel } from "./meaning-channel.js";

export { canonicalLoopTopology, validateLoopTopology } from "./topology.js";

// Only the loop's OWN new shared types are surfaced here; the borrowed shapes
// (LayerIndex, AgencyTag, ResistEvent, MismatchKind) are already exported by the
// invariants/store rings, so re-exporting them would collide at the root barrel.
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
  Directive,
} from "./types.js";

// The field's axes and how a layer reads and feeds them (INV-7).
export {
  TRUST,
  ALERTNESS,
  EXPLORATION,
  AXES,
  NEUTRAL,
  axis,
  rising,
  falling,
  shiftedCount,
  share,
  votes,
  castVotes,
} from "./field.js";
export type { Axis } from "./field.js";
