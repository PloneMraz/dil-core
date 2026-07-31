/**
 * The runtime / requisition ring — stage 5 of the build order.
 *
 * Wires the loop as a long-lived daemon over a declared host, with state
 * accruing across cycles. The self is what occurs while it runs.
 */

export {
  MODE_B_SOURCE,
  REFLECTION_MECHANISM,
  DIVERSITY_WINDOW,
  MIN_DIVERSITY_SOURCES,
} from "./decisions.js";

export { scriptedSource, type HostSource } from "./host-source.js";

export {
  createDiversityMonitor,
  type DiversityMonitor,
  type DiversityOptions,
} from "./diversity.js";

export { createDaemon, type Daemon, type DaemonDeps } from "./daemon.js";

export { collectManifest } from "./manifest.js";

export {
  requisition,
  RequisitionError,
  type Requisitioned,
} from "./requisition.js";

export {
  collisionCoordinates,
  formReading,
  reflectionSignal,
  reflectionTransducer,
  ReflectionError,
  type CollisionCoordinate,
  type ReflectionReading,
} from "./reflection.js";

export { takeSnapshot, restoreSnapshot, type SystemSnapshot } from "./commit.js";
