/**
 * The loop — stage 4 of the build order (protocol §6).
 *
 * 4a: the shared types of §6.1 and the DECIDE@IMPL tag-A representation choices.
 */

export {
  SIGNAL_PAYLOAD_REPR,
  INFOUNIT_CONTENT_REPR,
  REF_FRAME_REPR,
} from "./decisions.js";

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
