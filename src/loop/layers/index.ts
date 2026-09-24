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
  CHANNEL_ACTIVITY,
  STORE_CHANNEL,
  createT3,
  isStoreQuery,
  type ChannelTransducer,
  type Description,
  type StoreQuery,
  type T3Input,
  type T3Output,
} from "./t3.js";

export {
  STRANGENESS,
  createT4,
  STRANGER,
  type ContextResolver,
  type BoundInfo,
  type T4Input,
  type T4Output,
} from "./t4.js";

export {
  SURPRISE,
  createT5,
  persistence,
  type PredictRule,
  type AskFn,
  type T5Result,
  type T5Input,
  type T5Output,
  type T5Options,
} from "./t5.js";

export {
  OTHER_COUNT,
  createT6,
  type IndependenceEvidence,
  type T6Input,
  type T6Output,
} from "./t6.js";

export {
  ATTENTION_GAIN,
  SILENCE,
  attentionWidth,
  createT7,
  type T7Input,
  type T7Output,
  type T7Options,
} from "./t7.js";

export {
  INTERACTIONS,
  RESISTANCE_CONCENTRATION,
  createT8,
  type T8Input,
  type T8Output,
} from "./t8.js";
