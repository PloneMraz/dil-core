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
  GLOB_MOD_REPRESENTATION,
  GLOB_MOD_UPDATE_LAW,
} from "./decisions.js";

export * from "./layers/index.js";

export { createGlobMod, GlobModError, type GlobMod } from "./glob-mod.js";

export {
  validateLayerSpec,
  runLayer,
  type LayerSpec,
  type LayerRun,
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
