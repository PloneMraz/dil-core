/**
 * The eight layers T1–T8 (protocol §6.3; stage 4d).
 *
 * Built in dependency order. So far: T1 (Activity-Environment Confirmation),
 * T2 (Agency Differentiation — where the self crystallizes).
 */

export { createT1 } from "./t1.js";

export {
  createT2,
  type Emission,
  type ObservedChange,
  type TaggedChange,
  type T2Input,
  type T2Output,
  type T2Options,
} from "./t2.js";
