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
