/**
 * dil-core — public API surface.
 *
 * Built inside-out (AGENTS.md "Build order").
 *   Stage 1: the precondition gate.
 *   Stage 2: the eight invariant guards.
 *   Stage 3: the experience store.
 */

export type {
  HostDeclaration,
  ChannelDeclaration,
} from "./host/declaration.js";

export {
  checkPrecondition,
  type ConditionId,
  type ConditionResult,
  type GateResult,
} from "./precondition/gate.js";

export * from "./invariants/index.js";

export * from "./store/index.js";
