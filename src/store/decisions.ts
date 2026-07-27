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

/**
 * The store schema version — bumped whenever the meaning or domain of a fixed tag
 * changes. Provenance went from 3 values to 5 at v0.3.2 (prior/running/scar →
 * prior/running/simulated/projected/scar), the change that motivates this
 * versioning. Because `[event]` is immutable — a written record is never edited —
 * the log must be **self-describing** across such changes: every persisted line
 * is stamped with the SCHEMA_VERSION it was written under (hash-chain.ts), so a
 * reader interprets each record by its own version, and the DIL-CLAIM records the
 * current one (substrate.ts).
 *   1 → the original 3-state provenance (prior/running/scar).
 *   2 → v0.3.2's 5-state provenance graph (adds simulated, projected).
 */
export const SCHEMA_VERSION = 2;

/** DECIDE@IMPL tag F — store representation. */
export const STORE_REPRESENTATION =
  "[data] = SQLite (node:sqlite) under store/memory/; [event] = append-only hash-chained JSONL under store/event-log/; RAM holds only bounded caches, never the store of record" as const;
/**
 * Rationale (declared choice, not invented): the store-of-record lives on the
 * host's *requisitioned substrate* (CONTEXT §5), never in RAM. `[data]` (mutable
 * present) is a SQLite table via `node:sqlite` — SQLite built into Node, so it is
 * synchronous (matching the DataStore interface) and needs no external dependency
 * or native build (sqlite-data-store.ts). `[event]` (append-only) stays JSONL +
 * sha256 hash chain, the tamper-evident audit artifact (event-sink.ts). RAM is a
 * bounded working cache only. The in-memory Map (`createDataStore`) and array
 * `[event]` log are demoted to TEST FIXTURES. A different host may back the
 * substrate differently (via the Substrate seam, substrate.ts) or choose another
 * durable engine (e.g. better-sqlite3) behind the same DataStore interface.
 *
 * File-backed layout (DECIDE@IMPL tag F — the directory boundary IS the
 * rollback boundary). One parent root, `store/`, named after the ring itself
 * (§3: "[data], [event] — the two store kinds"):
 *
 *   <deployment root>/store/
 *     memory/      — [data] and restorable working state: the ONLY location a
 *                    recovery/rollback rewrites (mutable by design)
 *     event-log/   — [event] segments: append-only, records read-only forever;
 *                    NEVER rolled back — it keeps recording through a rollback
 *     commits/     — content-addressed markers: append-only; a rollback ADDS a
 *                    fork marker, it never deletes one
 *
 * `event-log/` and `commits/` sit BESIDE memory/, not inside it: they are
 * outside the loop's mutable reach, which is what makes them trustworthy as
 * evidence about it. (The protocol's "the [event] log is the agent's memory"
 * names its experiential ROLE — what the self accrues from — not this folder;
 * the folder named memory/ holds the mutable working state only.) Store-kind is
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

/** DECIDE@IMPL tag F — [event] log length policy and segmentation. */
export const MAX_SEGMENT_BYTES = 64 * 1024 * 1024;
export const EVENT_LOG_SEGMENTATION =
  "daily segments `event-log-yyyymmdd.jsonl`, overflowing to `-002`, `-003`… when a segment would exceed MAX_SEGMENT_BYTES; records never split across files; the hash chain continues across segments" as const;
/**
 * Rationale + law: the log itself has NO maximum length — records, once
 * written, are never altered or removed (§9), so any "full → truncate" policy
 * is flatly forbidden, and snapshots never license pruning pre-snapshot
 * records. What IS managed is the single-file size: MAX_SEGMENT_BYTES (64 MiB
 * — a tunable starting value, NOT derived; it bounds verify-time memory and
 * keeps segments tooling-friendly) rotates to a new file. A closed segment is
 * immutable and may be archived to cold storage (deployment-open, never
 * deleted). An append failure (e.g. disk full) throws and halts the loop —
 * a record is never dropped to keep running.
 */

/** DECIDE@IMPL tag F — durability sync policy of the persisted [event] log. */
export const EVENT_SYNC_POLICY =
  "fsync per record (write-through): each appended line is flushed to disk before the write returns, so every record is durable the instant it is appended" as const;
/**
 * Rationale (safe default, NOT derived): the sink fsyncs on every write
 * (event-sink.ts), so no appended record is ever lost to a crash — the
 * maximally-durable choice, and the reason the write-through default forfeits no
 * record. A high-throughput deployment MAY batch the fsync to a cycle boundary
 * (durability becomes cycle-atomic rather than record-atomic, trading per-record
 * durability for fewer syncs under the dense activity journal); that batching is
 * deployment-open and deliberately not built here, so the default stays the one
 * that loses nothing.
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
 * DECIDE@IMPL — commit/snapshot cadence and retention (protocol §9: "the
 * [event] log acts as a counter: after a set volume, a commit fires,
 * snapshotting the entire system … into an immutable, content-addressed
 * marker. Recovery is full-system. DECIDE@IMPL: events between commits;
 * snapshots retained").
 */

/** A commit fires after this many SCARS since the last commit. */
export const COMMIT_EVERY = 9;
/**
 * Rationale (tunable, NOT derived): the cadence counts scars, not all records —
 * state changes most when collisions are digested (the author's chosen rhythm).
 * Because activity records carry entity ids, not full observation content,
 * replay between commits is PARTIAL: a marker is a real restore point, not a
 * mere accelerator — hence a dense-ish cadence. Two declared valves: a quiet
 * stretch produces no automatic commit (an intended property of scar-rhythm;
 * crash during it falls back to the last marker), and the daemon exposes a
 * manual commit() for out-of-loop triggers (e.g. right before attaching an
 * untrusted source).
 */

/** How the marker/payload repo retains snapshots. */
export const SNAPSHOTS_RETAINED = "all (minimal host: nothing is pruned)" as const;
/** If a deployment prunes payloads, it MUST keep at least this many newest restore points. */
export const MIN_SNAPSHOTS_RETAINED = 9;
/**
 * Rationale (tunable, NOT derived): MARKERS are never pruned by anyone — they
 * are the audit DAG (parent-linked; deleting one holes the fork history).
 * Retention governs snapshot PAYLOADS only: the minimal host keeps all; a
 * pruning deployment must keep ≥ MIN_SNAPSHOTS_RETAINED newest payloads so the
 * roll-back depth covers a reader's detection lag (≈ 9 commits × 9 scars of
 * lookback). A pruned payload's marker remains — auditable, just not
 * restorable. No pruning machinery is implemented here (keep-all).
 */
export const COMMIT_CADENCE =
  "every COMMIT_EVERY scars, at a cycle boundary; manual commit() and a fork marker at recovery" as const;

/**
 * DECIDE@IMPL tag H — the building of situations in `simulated` (§6.2, §9).
 *
 * The protocol fixes only that selection among situations is a comparison of FIT
 * against the store, never a scored standard (INV-8). It leaves open how many
 * situations are built per cycle and what "fit" concretely measures.
 */

/** How many situations the loop builds from the store per cycle when it forward-builds. */
export const H_COUNT = 3;
/**
 * Rationale (tunable, NOT derived): a small fixed starting value — enough for a
 * fit-comparison to have alternatives to weigh, not a derived optimum. The loop
 * builds situations only where there is store material to build from; H_COUNT is
 * a ceiling, not a quota (fewer are built when the store affords fewer).
 */

export const FIT_MEASURE =
  "consistency with [data]: a situation fits better when the store more strongly supports its cast outcome (accumulated recurrence/confidence for that entity)" as const;
/**
 * Rationale + INV-8 boundary: fit is measured AGAINST the store's own [data] (the
 * yardstick), never a foreign standard and never a good/bad verdict — it is
 * consistency, not scoring-for-truth. It selects WHICH situation carries, blended
 * and re-weighted each cycle like GLOB-MOD contributions (INV-7), never frozen
 * (INV-2). This selection is UPSTREAM of and separate from the appraisal step,
 * whose valence still comes from the modulatory field (INV-8), so measuring fit
 * against [data] does not make the appraisal self-scoring. A store that leans
 * makes situations lean the same way; the loop cannot detect its own lean — that
 * is Mode-B's job (§1.1, §8), not forward-building's.
 */
