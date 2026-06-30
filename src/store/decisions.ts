/**
 * Declared DECIDE@IMPL choices for the experience store (protocol §10, §12).
 *
 * The protocol leaves these open *on purpose*; a conforming implementation MUST
 * fill each and MUST declare the value it chose (protocol §12, AGENTS.md "Do NOT
 * invent the deferred constants"). This file is that declaration: every
 * representational/numeric choice the store makes is named here, with its
 * rationale, so nothing downstream is hardcoded silently.
 *
 * These choices are for the *minimal host you fully control* (build order step
 * 5). They are environment decisions, not protocol law; a different host may
 * declare differently without changing the protocol.
 */

/** DECIDE@IMPL tag F — store representation. */
export const STORE_REPRESENTATION = "in-memory" as const;
/**
 * Rationale: the store is built before the loop (build order step 3) and the
 * first run targets a minimal host. `[event]` is an append-only array of
 * deeply-frozen records; `[data]` is a mutable map. Durable backing (SQLite/
 * file) is a host-declared concern layered on later; E3 persistence is a host
 * faculty, not the store module's responsibility.
 */

/** DECIDE@IMPL tag F — index keys. */
export const INDEX_KEYS = ["source_id", "provenance"] as const;
/** Rationale: the two access paths the loop and an auditor actually need. */

/** DECIDE@IMPL tag F — write policy for the [event] log. */
export const EVENT_WRITE_POLICY = "store-all" as const;
/**
 * Rationale: the [event] log is the audit trace (protocol §9, §13). A
 * selective-write policy could drop a record an auditor needs; the trusted
 * artifact must keep every record. Selectivity, if ever wanted, belongs to
 * [data], not [event].
 */

/**
 * DECIDE@IMPL tag F — the open-tag registry beyond `domain`.
 *
 * The protocol fixes no industry vocabulary of open-tag keys (protocol §9,
 * "Open-tag discipline"): which keys exist beyond the mandatory `domain`, and
 * what each means, is environment-specific and declared here. There is no
 * required *number* of keys — sufficiency is whatever the deployment's audit
 * needs require; inventing tags to meet a quota would fabricate data to fill a
 * gap, which the loop forbids.
 *
 * For the minimal host we declare the registry FREE-FORM: only `domain` is
 * required (enforced at the tagging-gate); any other key is permitted so long as
 * it is not a verdict. An empty `OPEN_TAG_REGISTRY` means "no fixed vocabulary
 * declared". A real, industry-specific deployment replaces this with its own
 * keys and their definitions (e.g. platform, role, region, env) and MAY then
 * enforce them — that enforcement is intentionally not built here.
 */
export const OPEN_TAG_REGISTRY = "free-form" as const;
/**
 * Declared well-known keys for this host. Empty under the free-form choice. The
 * shape is fixed so a deployment can fill it: key → human-readable definition.
 */
export const OPEN_TAG_DEFINITIONS: Readonly<Record<string, string>> = Object.freeze(
  {},
);

/** DECIDE@IMPL tag F — store scope. */
export const STORE_SCOPE = "private" as const;
/**
 * Rationale: the minimal host serves one agent. A private store MUST carry the
 * resistance-retrieval channel, otherwise drift is certain (protocol §10); that
 * channel is wired when the loop's Mode-B anchor lands (stage 4+). A shared
 * store is a later, multi-agent decision.
 */

/** DECIDE@IMPL tag G — depth of the per-[event] context anchor. */
export const CONTEXT_ANCHOR_DEPTH = "full-field-state" as const;
/**
 * Rationale: each [event] anchors the *full* field-state of its cycle (not a
 * minimal context-trace), so a third party can re-appraise an event under its
 * original context with maximum fidelity (protocol §8.5, §9). This trades
 * storage cost for audit fidelity — the chosen trade for this host.
 */

/**
 * DECIDE@IMPL — commit/snapshot cadence (protocol §9: events between commits;
 * snapshots retained). DEFERRED: not yet implemented. The commit counter and
 * content-addressed snapshot marker (which also provides the stronger,
 * tamper-evident guarantee beyond in-memory freezing) are a later sub-step.
 * Left open here rather than filled with an invented number.
 */
export const COMMIT_CADENCE = "DEFERRED" as const;
