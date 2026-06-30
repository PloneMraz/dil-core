/**
 * Declared DECIDE@IMPL choices for the loop's shared types (protocol §12 tag A).
 *
 * Tag A — "Concrete representation of Signal, InfoUnit, and ActivityEnvironment"
 * — is left open by the protocol because it depends on the environment. This
 * file declares the representations chosen for the minimal host, so nothing in
 * types.ts is a silently-invented shape (AGENTS.md "Do NOT invent the deferred
 * constants"). These are environment decisions, not protocol law.
 *
 * Numeric thresholds (tag B: matching window, stability, baseline, recurrence,
 * history window) belong to the layers and are declared when those land (4d);
 * none is needed for the type layer.
 */

/** DECIDE@IMPL tag A — Signal.raw_payload. */
export const SIGNAL_PAYLOAD_REPR = "unknown (host-shaped raw bytes/values)" as const;
/**
 * Rationale: a Signal is raw host data, not yet meaning; its payload shape is
 * whatever the host emits. We keep it `unknown` at the type layer and let each
 * channel's transducer (T3, DECIDE@IMPL) narrow it. `source_id` is a string,
 * `t` an epoch-millisecond number (matching the store's timestamps).
 */

/** DECIDE@IMPL tag A — InfoUnit.content. */
export const INFOUNIT_CONTENT_REPR = "unknown (referred content)" as const;
/**
 * Rationale: content becomes information only once referred to a frame
 * (INV-4); its concrete shape is environment-specific, kept `unknown` here.
 */

/** DECIDE@IMPL tag A — the reference frame an InfoUnit is referred to. */
export const REF_FRAME_REPR = "{ boundLayer, ref } (lower-layer context handle)" as const;
/**
 * Rationale: meaning is a function of (signal, lower-layer context), so the
 * frame names the lower layer that supplies the context and an identifier of
 * that context. It is a non-null structured handle — the type layer makes
 * `ref_frame` non-nullable, which is where INV-4 is enforced at the type level
 * (a Signal, lacking a frame, is simply not an InfoUnit).
 */
