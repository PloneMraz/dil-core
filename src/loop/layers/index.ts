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

export {
  createT3,
  type ChannelTransducer,
  type T3Input,
  type T3Output,
} from "./t3.js";

export {
  createT4,
  STRANGER,
  type ContextResolver,
  type BoundInfo,
  type T4Input,
  type T4Output,
} from "./t4.js";

export {
  createT5,
  type T5Result,
  type T5Input,
  type T5Output,
  type T5Options,
} from "./t5.js";
