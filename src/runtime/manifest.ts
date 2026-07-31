/**
 * Collect the run's DECIDE@IMPL constitution into a genesis manifest (§9, §8.5).
 *
 * The runtime ring is the one place that can see every ring's declared choices, so
 * it gathers them here — reading the ACTUAL declared constants (never re-stating
 * values, so the manifest cannot drift from the decisions files) — and builds the
 * one-time manifest record the daemon writes as the first `[event]` line. A third
 * party then reads the law the run operated under from the trusted log alone.
 *
 * Tag A (Signal / InfoUnit / RefFrame representation) is a TYPE-level choice, not a
 * runtime value; it is described, not snapshotted. Every other declared choice that
 * governs behavior is captured verbatim from its declaration.
 */

import { recordManifest, type ManifestRecord } from "../store/resist-event.js";
import { DIL_CLAIM } from "../store/substrate.js";
import {
  SCHEMA_VERSION,
  STORE_REPRESENTATION,
  CONTEXT_ANCHOR_DEPTH,
  H_COUNT,
  FIT_MEASURE,
  COMMIT_EVERY,
} from "../store/decisions.js";
import {
  MATCHING_WINDOW,
  STABILITY_THRESHOLD,
  BASELINE_WINDOW,
  SUFFICIENT_RECURRENCE,
  APPRAISAL_ANCHOR_KIND,
  APPRAISAL_ANCHOR_ID,
} from "../loop/decisions.js";
import { MODE_B_SOURCE, REFLECTION_MECHANISM, DIVERSITY_WINDOW, MIN_DIVERSITY_SOURCES } from "./decisions.js";
import { CONFORMANCE_DIVERSITY_WINDOW, CONFORMANCE_MIN_DISTINCT_SOURCES } from "../conformance/decisions.js";

/** Build the genesis manifest from the declared DECIDE@IMPL choices, stamped at `t`. */
export function collectManifest(t: number): ManifestRecord {
  return recordManifest(DIL_CLAIM.protocol, SCHEMA_VERSION, {
    tagA_representation: "Signal/InfoUnit/RefFrame shapes — a type-level choice (loop/decisions.ts), not a runtime value",
    tagB_thresholds: { MATCHING_WINDOW, STABILITY_THRESHOLD, BASELINE_WINDOW, SUFFICIENT_RECURRENCE },
    tagC_appraisalAnchor: { kind: APPRAISAL_ANCHOR_KIND, id: APPRAISAL_ANCHOR_ID },
    tagD_modeBSource: MODE_B_SOURCE,
    tagE_reflection: REFLECTION_MECHANISM,
    tagF_storeRepresentation: STORE_REPRESENTATION,
    tagG_contextAnchorDepth: CONTEXT_ANCHOR_DEPTH,
    tagH_forwardBuilding: { H_COUNT, FIT_MEASURE },
    diversity: { window: DIVERSITY_WINDOW, minSources: MIN_DIVERSITY_SOURCES },
    conformanceDiversity: { window: CONFORMANCE_DIVERSITY_WINDOW, minSources: CONFORMANCE_MIN_DISTINCT_SOURCES },
    commit: { COMMIT_EVERY },
  }, t);
}
