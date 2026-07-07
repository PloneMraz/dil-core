/**
 * dil-core — public API surface.
 *
 * Built inside-out (AGENTS.md "Build order").
 *   Stage 1: the precondition gate.
 *   Stage 2: the eight invariant guards.
 *   Stage 3: the experience store.
 *   Stage 4: the loop (T1–T8, GLOB-MOD, cycle driver).
 *   Stage 5: the runtime daemon (continuous run).
 *   Stage 6: the conformance checker.
 */

export type {
  HostDeclaration,
  ChannelDeclaration,
  StoreProbe,
  TraceProbe,
} from "./host/declaration.js";

export {
  checkPrecondition,
  type ConditionId,
  type ConditionBasis,
  type ConditionResult,
  type GateResult,
} from "./precondition/gate.js";

export {
  PROBEABLE_CONDITIONS,
  E3_PROBE_DESIGN,
  E4_PROBE_DESIGN,
  PROBE_NONCE_PREFIX,
} from "./precondition/decisions.js";

export * from "./invariants/index.js";

export * from "./store/index.js";

export * from "./loop/index.js";

export * from "./runtime/index.js";

export * from "./conformance/index.js";
