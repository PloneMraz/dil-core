/**
 * Experience store — stage 3 of the build order (protocol §9, §10).
 *
 * The data layer the loop writes into: fixed/open tags, the tagging-gate,
 * the mutable [data] store, the append-only read-only [event] log, the
 * prior→running→scar lifecycle, the ResistEvent atomic unit, and the full
 * field-state context anchor. DECIDE@IMPL choices are declared in decisions.ts.
 */

export {
  STORE_REPRESENTATION,
  INDEX_KEYS,
  EVENT_WRITE_POLICY,
  EVENT_DURABILITY,
  EVENT_TAMPER_EVIDENCE,
  MAX_SEGMENT_BYTES,
  EVENT_LOG_SEGMENTATION,
  STORE_SCOPE,
  CONTEXT_ANCHOR_DEPTH,
  COMMIT_CADENCE,
  COMMIT_EVERY,
  SNAPSHOTS_RETAINED,
  MIN_SNAPSHOTS_RETAINED,
  OPEN_TAG_REGISTRY,
  OPEN_TAG_DEFINITIONS,
} from "./decisions.js";

export type {
  Provenance,
  FixedTags,
  OpenTags,
  LayerTrace,
  TaggedDatum,
} from "./tags.js";
export {
  invalidOpenTagReason,
  REQUIRED_OPEN_TAG_KEYS,
  MIN_OPEN_TAGS,
} from "./tags.js";

export type {
  MismatchKind,
  ResistEvent,
  ContextAnchor,
  EventRecord,
  ActivityEvent,
  ActivityRecord,
  LogRecord,
} from "./resist-event.js";
export { recordScar, recordActivity, EventRecordError } from "./resist-event.js";

export {
  TaggingGateError,
  admitHostData,
  type HostDatum,
} from "./tagging-gate.js";

export { createEventLog, deepFreeze, type EventLog } from "./event-log.js";

export {
  createJsonlFileSink,
  serializeEventRecord,
  readJsonlSink,
  readChainedLines,
  verifyJsonlSink,
  listSegments,
  type EventSink,
  type FileEventSink,
  type JsonlSinkOptions,
  type SerializedEventRecord,
} from "./event-sink.js";

export {
  CHAIN_GENESIS,
  chainNext,
  hashChainEntry,
  verifyChain,
  type ChainedEventLine,
  type ChainVerification,
} from "./hash-chain.js";

export { displayName, eventDisplayName } from "./display-name.js";

export { inspectData, inspectEventLog } from "./inspector.js";

export {
  LifecycleError,
  stampLayer,
  toRunning,
  toScar,
  createDataStore,
  type DataStore,
} from "./data-store.js";

export {
  createSqliteDataStore,
  type SqliteDataStore,
} from "./sqlite-data-store.js";

export {
  createDirCommitStore,
  type CommitStore,
  type CommitMarker,
} from "./commit-store.js";

export {
  DIL_CLAIM,
  fsSubstrate,
  layoutFor,
  claimSubstrate,
  SubstrateClaimError,
  type DilClaim,
  type StoreLayout,
  type Substrate,
} from "./substrate.js";
