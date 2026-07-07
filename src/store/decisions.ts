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
 *
 * Planned file-backed layout (when STORE_REPRESENTATION becomes file-based):
 * a `memory/` directory with two sub-locations — `memory/data/` for `[data]`
 * content and `memory/event-log/` for `[event]` records. The store-kind is then
 * carried by *location*, not by a name prefix; an item's human-readable name is
 * the derived projection of its tags (display-name.ts), not a place tags live.
 */

/** DECIDE@IMPL tag F — index keys. */
export const INDEX_KEYS = ["source_id", "provenance"] as const;
/** Rationale: the two access paths the loop and an auditor actually need. */

/** DECIDE@IMPL tag F — [event] durability. */
export const EVENT_DURABILITY =
  "in-memory by default; optional append-only JSONL file sink (event-sink.ts)" as const;
/**
 * Rationale: the in-memory [event] log is append-only with read-only records but
 * dies with the process, so on its own it is not audit-ready after the run. A
 * deployment that needs durability wires a JSONL file sink into `createEventLog`
 * (a durable daemon is configured by passing a sink-backed [event] log); each
 * appended record is mirrored to disk, fsynced, one immutable line per record,
 * with tags serialized in the fixed order. The default stays in-memory so tests
 * need no filesystem. This provides DURABILITY; tamper-evidence at rest is
 * provided by the hash chain (EVENT_TAMPER_EVIDENCE below).
 */

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
 * what each means, is environment-specific and declared here. Protocol §9 does
 * set a floor of at least three open tags per datum (one being `domain`), each
 * describing a real dimension — a floor on honest description, not a quota to
 * pad; a tag invented merely to reach the count, that does not describe the
 * datum, fabricates data to fill a gap, which the loop forbids.
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

/** DECIDE@IMPL tag F — tamper-evidence of the persisted [event] log. */
export const EVENT_TAMPER_EVIDENCE =
  "sha256 hash chain over the JSONL sink lines (hash-chain.ts): each line carries seq + prev + hash; verifyJsonlSink detects any altered, removed, inserted, or reordered line; the chain resumes across restarts" as const;
/**
 * Rationale + honest limits: sha256 via node:crypto (built-in, no dependency).
 * Detection is relative to a trusted head — a party with full write access can
 * rewrite the whole chain consistently, so a deployment anchors the sink's
 * head() outside its own write reach (publish to the user, an external log);
 * that anchoring is deployment-open, like tag D. In-process tampering is out of
 * scope by definition (the in-memory guard remains deep-freeze + no-mutation
 * API). This is NOT the §9 full-system commit/snapshot (COMMIT_CADENCE below).
 */

/**
 * DECIDE@IMPL — commit/snapshot cadence (protocol §9: events between commits;
 * snapshots retained; the snapshot covers the ENTIRE system — loop
 * configuration, layer state, field parameters — with full-system recovery).
 * DEFERRED: layer state is not yet serializable, so the full-system snapshot
 * cannot be built without faking it. The log's tamper-evidence shipped
 * separately (EVENT_TAMPER_EVIDENCE above) and does not pretend to be this.
 * Left open rather than filled with an invented number.
 */
export const COMMIT_CADENCE = "DEFERRED" as const;
