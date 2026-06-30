/**
 * dil-core — public API surface.
 *
 * Built inside-out (AGENTS.md "Build order"). Stage 1: the precondition gate.
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
