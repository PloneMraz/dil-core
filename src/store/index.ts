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
  STORE_SCOPE,
  CONTEXT_ANCHOR_DEPTH,
  COMMIT_CADENCE,
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
} from "./resist-event.js";
export { recordScar, EventRecordError } from "./resist-event.js";

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
  type EventSink,
  type FileEventSink,
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
