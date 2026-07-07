# Changelog

All notable changes to DIL are documented here, ordered newest-first.

---

## [Unreleased] — 2026-07-07

### — feat: tamper-evidence — sha256 hash chain over the [event] sink
**Commits:** `aa158e4` (chain + sink), `dbe4cb8` (README)

Each persisted JSONL line is chained (`seq` + `prev` + sha256 hash over the fixed-order record); `verifyJsonlSink` detects any altered, removed, inserted, or reordered line at the break point; the chain resumes across restarts, refuses to open on a corrupt tail, and exposes `head()` for external anchoring. Honest scope declared (`EVENT_TAMPER_EVIDENCE`): detection is relative to a trusted head — anchoring is deployment-open; in-process tampering out of scope; NOT the §9 full-system commit/snapshot, which stays DEFERRED (layer state not yet serializable). node:crypto only, zero new dependencies. 8 new tests (159 total), verified on real bytes (one-byte tamper → `content break` at line 0).

---

### — feat: precondition gate probes E3/E4 — evidence-graded verdicts
**Commit:** `eeff8e7`

Each gate verdict now carries a basis: `probed` (the gate exercised a host-declared handle — StoreProbe marker round-trip for E3/P(b), TraceProbe marker read-back for E4) or `declared` (requisition's designed mechanism, graded honestly). Evidence beats claim: a failing/throwing probe fails a true declaration; a negative declaration is not overruled by a working probe. E1/E2/P(a)/P(c) stay declaration-based with declared reasons (E2: idle is the default — a silent probe window proves nothing; P(c): testing self-wipe means inducing a mismatch, i.e. running). §13.2 surfaces probed/declared counts. 151 tests.

---

### — docs: README — split open items into deferred vs deployment-open
**Commit:** `9b7ed8d`

The "Deferred" section mixed two kinds §12 itself distinguishes: unbuilt core work (tamper-evidence, multi-stream) versus deliberately-open deployment declarations (Mode-B liveness/tag D, the reflection reader/tag E, the open-tag registry/tag F). Split into two subsections so a deployment property is never again misread as unfinished work.

---

## [Unreleased] — 2026-07-06

### — feat: reflection mechanism — read collision into coordinates (tag E)
**Commits:** `c40f50a` (mechanism), `560389b` (README)

Wired tag E (§8.4): a third party reads a recorded collision out of the `[event]` log into coordinates (`collisionCoordinates`/`formReading` — fabrication about a non-existent collision is refused) and returns it through a declared T3 channel (`reflectionSignal` + `reflectionTransducer`), classified ENV_PUSHED. The coordinate system is the `[event]` log itself; no parallel channel, no self-reflection faculty; who the reader is stays deployment-open like tag D. `REFLECTION_MECHANISM` no longer DEFERRED; §13.5 now passes on runs whose traces show diverse sources (diverse run: 6 pass / 1 partial — the remainder is §13.4 Self, partial by design). 144 tests.

---

## [Unreleased] — 2026-07-05

### — docs: README — Mode-B liveness is a deployment property
**Commit:** `177b6a0`

Corrected the Deferred bullet that misframed "Live Mode-B" as unbuilt machinery. The Mode-B seam (`HostSource`) is built and declared (tag D); an Other is a positional status, not a kind — one channel carries any number of Others, so no per-Other source file exists to be written. What stays open is *deliberately* open per protocol §12: which live Other a deployment plugs in. The honest residual: the shipped scripted **test fixture** yields fixed, replayable (deceleration-grade, §8.3) resistance.

---

### — docs: README — fix blockquote lead-in, qualify audit-ready claim
**Commit:** `edbc4bf`

Blockquote lead-in corrected from "the two normative documents" (three bullets, only one normative) to "Read this alongside:", keeping the normative annotation on the protocol bullet only. Line 1's unconditional "audit-ready" scoped to the `[event]` trail, durable only when backed by the JSONL file sink. Raw sink bytes verified on disk (fixed-order tags, ≥3 open tags incl `domain`, full layer_trace) via a temporary script, deleted after the run.

---

## [Unreleased] — 2026-06-30

### 18:05 — docs: README updated for evidence-based checker + durable sink
**Commit:** `d396a08`

Status reports the real 4 pass / 3 partial / 0 fail of a short run (honest partials explained); Quick start drops the removed `diversityWired` flag and adds a JSONL file-sink example; the store section documents durability vs tamper-evidence; Deferred lists tamper-evidence honestly.

---

### 17:55 — fix: durable append-only JSONL sink for the [event] log (ISSUE 3)
**Commit:** `5e1a451`

Added an `EventSink` interface (only method: `write` — no update/delete/truncate by construction) and a JSONL file sink (`node:fs`, append mode, one immutable fsynced line per record, tags serialized in fixed order). `createEventLog` gains an optional sink and mirrors every appended record; in-memory stays the default. Declared `EVENT_DURABILITY` in `store/decisions.ts`. Durability only — tamper-evidence (content-addressed/hash-chained markers) stays deferred, not faked. Tests: survive reopen, no mutation surface, ordered round-trip.

---

### 17:45 — fix: conformance checker derives diversity from evidence (ISSUE 2)
**Commit:** `fa23f07`

Removed the `diversityWired`/`diversitySignal`/`reflectionWired` self-attestation flags — a criterion satisfied by the caller's claim is not a measurement. Criterion 7 (§13.7) is now derived from the `[event]` log's source_id distribution over a declared window (enough evidence + diverse → pass; single-source collapse → fail; too thin → partial, never a false pass). Criterion 5's reflection status reads from `REFLECTION_MECHANISM`. Declared `CONFORMANCE_DIVERSITY_WINDOW=8` / `CONFORMANCE_MIN_DISTINCT_SOURCES=2` in `conformance/decisions.ts` as tunable, not-derived. Result: a thin run scores 4/3/0; a genuinely diverse run scores 5/2/0.

---

### 17:35 — docs: add README
**Commit:** `a915a70`

Added a project README: the `host + self = agent` equation and the reign-not-rule principle, the four concentric rings mapped to `src/` directories, the six build stages with their fixed checks, install/test commands, an end-to-end quick-start (daemon + inspector + conformance), the `[data]`/`[event]` store and tag schema, the declared DECIDE@IMPL choices, and an honest list of deferred items.

---

### 17:20 — feat: conformance checker — the seven §13 criteria (stage 6)
**Commit:** `b284ced`

`checkConformance` reads the `[event]` log (the one trusted trace) plus observable facts (gate outcome, diversity signal) and scores each §13 criterion into a per-criterion pass/partial/fail/unverifiable table; `renderConformance` prints it. Deliberately honest: criterion 4 (Self) is PARTIAL because self-continuity is attributable only by a third party (§7); criterion 5 (Resistance) is PARTIAL while reflection is DEFERRED (§8.4); an empty log is unverifiable, never passed. Verified end-to-end over a real daemon run (5 pass, 2 partial, 0 fail). 8 tests (127 total). **Stage 6 complete — the build order is finished.**

---

### 17:00 — feat: runtime daemon — continuous run (stage 5)
**Commit:** `1c962cb`

Wired the loop as a long-lived daemon (CONTEXT.md §4). `createDaemon` holds **one** persistent cycle instance and drives it over a `HostSource`, so state accrues across cycles (INV-5) and the causal line is unbroken — the self is what occurs while it runs, with no internal continuity claim. Startup is precondition-gated (non-qualifying host → clean non-start). Added the requisition ring `src/runtime/`: `HostSource` + scripted source, the diversity-loss monitor (§11, conformance criterion 7), and the daemon. Collisions are now sourced by entity so diversity is measurable. Declared tag D (live Mode-B = host source) as the real brake replacing the static anchor; tag E (reflection) declared DEFERRED; diversity thresholds tunable. End-to-end verified (5-cycle run records value-mismatch + absence scars). 7 tests (119 total). **Stage 5 complete.**

---

### 16:40 — feat: cycle driver — one full loop pass (stage 4e, stage 4 complete)
**Commit:** `4f3dfbe`

`createCycle`/`run` drives one pass T1→T8 single-threaded (cycle-0), threading a cycle datum through every layer so it accrues a floor-tag and trace entry at each (trace `[1,1..8]`, floor-tag 8). Runs the appraisal step (INV-8) under the cycle's GLOB-MOD context (§8.5), produces a response that feeds back as the next emission (INV-1), records held collisions as scars in the `[event]` log (the event inheriting the cycle datum's `domain`), and advances GLOB-MOD to N+1 (INV-7). Declared the Mode-A appraisal anchor as static (tag C) with the honest §8.3 caveat; live Mode-B (tag D) deferred to stage 5. Added `appraisal.ts`. 8 tests (112 total). **Stage 4 complete** — the loop runs one cycle correctly.

---

### 16:20 — feat: layers T6, T7, T8 (stage 4d, part 3 — all eight layers)
**Commit:** `3837e07`

T6 (Other-Model Synthesis) accrues per-entity independence evidence (resistance met, env-pushed), non-zero only under Mode-B, degenerating under Mode-A. T7 (Absence Registration) registers an expected entity's failure to return as a signed-negative PredErr (observed null, signed "-"), accruing expected entities (INV-5). T8 (Multi-Entity Abstraction) builds RelValue only when N≥2 (ranked by resistance) and passes through Other↔Other SocialEdges; asserts its output is a correlation, never an identity (T8-INV / INV-2). 8 tests (104 total). All eight layers T1–T8 now exist.

---

### 16:05 — feat: layers T3, T4, T5 (stage 4d, part 2)
**Commit:** `ce32db1`

T3 (Channel Ingestion) transduces signals into typed InfoUnits, keeping info-type and physical channel distinct (per-channel transducer is pluggable DECIDE@IMPL). T4 (Context Binding) binds to `entity_id` or STRANGER via a pluggable resolver. T5 (Temporal Expectation) builds a per-entity Expectation and emits a signed PredErr — where resistance becomes information — under the declared persistence law; state accrues per entity (INV-5), confidence ramps over `SUFFICIENT_RECURRENCE`, and PredErr falls to zero with repetition against a stable entity (C2). Declared tag-B thresholds (`BASELINE_WINDOW=16`, `SUFFICIENT_RECURRENCE=3`) openly as tunable. 8 tests (96 total).

---

### 15:50 — feat: layers T1 and T2 (stage 4d, part 1)
**Commit:** `604317e`

T1 (Activity-Environment Confirmation) confirms the root reference frame, no self/env line. T2 (Agency Differentiation) draws the agency line across cycles: UNDECIDED until `STABILITY_THRESHOLD` cycles accrue, then SELF_WRITTEN vs ENV_PUSHED by matching recent emissions. Where the self crystallizes (§7); no self-continuity claimed. State accrues (INV-5); once stable nothing leaves UNDECIDED (INV-6 postcondition). Declared tag-B thresholds (`MATCHING_WINDOW=8`, `STABILITY_THRESHOLD=3`) openly as tunable starting values, not derived constants. 8 tests (88 total).

---

### 15:35 — feat: layer scaffold + meaning-channel + topology (stage 4c)
**Commit:** `1f6030f`

The uniform harness T1–T8 plug into, no layer logic yet. `LayerSpec` fixes the In/Out/Pre/Post contract; `runLayer` runs pre→process→post, asserts INV-4 (ref_frame≠null) on emitted InfoUnits, and stamps the floor-tag/layer_trace. `validateLayerSpec` enforces INV-3 at registration. The meaning-channel (up) guards reads by INV-3, separate from the modulatory field (down). `topology.ts` gives the canonical T1→T8→T1 edges and validates closure (INV-1). 10 stub-driven tests (80 total): a datum traverses leaving a floor-tag at each layer; halts on INV-3/INV-4/INV-1.

---

### 15:20 — feat: GLOB-MOD modulatory field (stage 4b)
**Commit:** `c218100`

The modulatory field (INV-7) as a double-buffered `ModField`: `createGlobMod` / `current` / `contribute` / `advance`. Update law (option A, declared): a convex per-key weighted average of a cycle's contributions, untouched keys carrying over, effect at N+1. Guarantees: `contribute()` never changes the active field (within-cycle immutable; `advance` routes through `assertGlobModUpdate`), and the convex blend keeps the field within its contributions' range — no runaway, no gain cap, no inertia constant invented. 9 tests including a 50-cycle randomized no-runaway check (70 total).

---

### 15:05 — feat: loop shared types §6.1 (stage 4a)
**Commit:** `8620c11`

First slice of the loop. Defined the §6.1 shared types (`RefFrame`, `Signal`, `InfoUnit`, `ActivityEnvironment`, `Expectation`, `PredErr`, `OtherModel`, `RelValue`, `SocialEdge`, `ModField`, `Appraisal`) in `src/loop/`. **INV-4 enforced at the type level**: `InfoUnit.ref_frame` is non-nullable, so a Signal (no frame) is not an InfoUnit. Reconciled with inner rings — the loop borrows `LayerIndex`/`AgencyTag` from invariants and `LayerTrace`/`ResistEvent`/`MismatchKind` from the store rather than redefining them. Declared DECIDE@IMPL tag A (concrete representations) in `loop/decisions.ts`. 61 tests, including `@ts-expect-error` type-level checks.

---

### 14:50 — feat: read-only inspector for [data] and [event]
**Commit:** `784dca0`

Added `inspectData` and `inspectEventLog`: a read-only human-readable view of the store using the `displayName` projection, so a person can see each item's tags on access. Read-only by construction (calls only read methods, never mutates); added a read-only `entries()` enumeration to `DataStore`. Rendering complete and tested; live-daemon wiring is stage 5. 56 tests.

---

### 14:35 — feat: displayName — derived tag→name projection
**Commit:** `35efb4a`

Added `displayName(datum)` and `eventDisplayName(record)`: a human-readable name **computed from** a datum's tags, not a place tags live. Tags stay structured properties; the name is derived on demand, so the updatable floor-tag and advancing provenance never force a rename, and keyed open tags render as `key:value` (filterable, not lossy positions). Store-kind prefix omitted — kind is carried by location. Declared the planned file-backed layout (`memory/data`, `memory/event-log`) in `decisions.ts`. 52 tests.

---

### 14:20 — feat: [event] record inherits its tags from the scar it traced
**Commit:** `343d24b`

An `[event]` record now embeds the whole `scar` `[data]` datum rather than re-stating a tag subset, inheriting its four fixed tags, ≥3 open tags (including `domain`), and `layer_trace`. So an `[event]` record carries the same minimum seven tags as any datum, plus the anchor, with no tag drift. `EventRecord` is now `{ event, scar, anchor }`; new `recordScar()` requires provenance `scar` (only collision-and-hold reaches `[event]`) and throws `EventRecordError` otherwise. New tests assert tag inheritance and non-scar rejection. 47 tests.

---

### 14:05 — feat: floor-tag is an updatable slot; add separate layer_trace
**Commit:** `376da4f`

Reconciled floor-tag semantics. The floor-tag is a single slot each layer **overwrites** to the layer just exited ("where is it now"); the four fixed slots are never stripped or reordered, but their values advance under defined rules. The full path lives in a separate `layer_trace` (§6.1), appended at each layer and read for audit ("where has it been"). Code: `TaggedDatum` gains `trace: LayerTrace`; the tagging-gate seeds it; new `stampLayer` primitive overwrites floor-tag + appends to trace. Fixed the imprecise "never overwritten" / "leaving a floor-tag at each layer" wording across protocol §9/§13.6, AGENTS.md, CONTEXT.md. 45 tests.

---

### 13:50 — feat: require at least three open tags per datum
**Commit:** `2d78737`

Protocol §9 now requires every datum to carry at least three open tags, one being `domain`, each describing a real dimension. Reconciled the earlier anti-quota wording: the minimum is a **floor on honest description**, not a quota to pad — a tag that does not describe the datum still fabricates data and is forbidden. Updated §9 (open layer + discipline) and conformance §13.6. Enforced via `MIN_OPEN_TAGS=3` in `tags.ts`; the gate checks presence/count/verdict structurally, while honest description stays the minter's responsibility and an auditor's read. 42 tests.

---

### 13:35 — docs: fix open-tag discipline; registry is host-declared
**Commit:** `9b71c7a`

Clarified the open-tag layer. Protocol §9 gains an "Open-tag discipline" clause: a key names a descriptive dimension, governed by exactly two rules (keys consistent, never a verdict). The core fixes **no** industry vocabulary and **no** required number of open tags — sufficiency is the deployment's audit needs, and inventing tags to meet a quota would fabricate data. §12 tag F now covers the open-tag registry as industry-specific DECIDE@IMPL. Declared `OPEN_TAG_REGISTRY = free-form` with an empty `OPEN_TAG_DEFINITIONS` slot a real deployment fills; no registry enforcement built.

---

### 13:20 — feat: require mandatory open tag `domain` for auditability
**Commit:** `239a08b`

Protocol §9 correction. The open-tag layer was imprecise: it is now stated that every datum MUST carry at least the open tag `domain` (the data class) so the `[event]` log is auditable by class, while other open tags stay optional and may vary by data type. Updated protocol §9 and conformance §13.6, and enforced the rule at the tagging-gate (`REQUIRED_OPEN_TAG_KEYS` in `tags.ts`); admission now fails when `domain` is missing or empty. `HostDatum.open` is now required. 41 tests.

---

### 13:05 — feat: experience store (tags, gate, [data]/[event], lifecycle, anchor)
**Commit:** `d8f3509`

Stage 3 of the build order. Added the fixed four-tag schema + open tags (`tags.ts`), the `ResistEvent` atomic unit + full field-state context anchor (`resist-event.ts`), the tagging-gate admitting host data only as `prior` with no side door (`tagging-gate.ts`), the append-only deep-frozen read-only `[event]` log (`event-log.ts`), and the mutable `[data]` store with the prior→running→scar lifecycle (`data-store.ts`). DECIDE@IMPL choices declared in `decisions.ts` (tag F: in-memory, source_id/provenance index, store-all, private; tag G: full-field-state anchor per the user's call). Commit/snapshot cadence deferred, left open rather than invented. 13 new smoke cases (40 total).

---

### 12:45 — feat: eight invariant guards (INV-1..INV-8)
**Commit:** `77f3aeb`

Stage 2 of the build order. Each invariant (protocol §5) is a guard that halts via a thrown `InvariantViolation` when a step would violate it — never a returned boolean. Added `violation.ts` (halt signal), provisional minimal `types.ts` (to be reconciled with full shared types in stage 4), and `guards.ts` (the eight guards). No thresholds, no `DECIDE@IMPL` touched. 17 dummy-data smoke cases assert each guard both halts a violating step and passes a conforming one (27 tests total).

---

### 12:30 — test: stage-1 smoke test for the precondition gate
**Commit:** `d8cfd56`

Added 10 `node:test` cases over `checkPrecondition` (no runtime dependency; added `@types/node` devDependency for built-in type declarations). Covers each of E1–E4 and P(a/b/c), the E2 void-field threshold, the P(b)=E3 coupling, and that the gate reports every failure rather than short-circuiting. Added `test` script (`tsc && node --test "dist/**/*.test.js"`).

---

### 12:20 — docs: add Vietnamese-only response rule to CLAUDE.md
**Commit:** `7852250`

Added a MUST rule: always respond in Vietnamese-only (English allowed for special phrases/terms).

---

### 12:15 — feat: precondition gate (E1-E4, P(a/b/c))
**Commit:** `f9d03cd`

Stage 1 of the build order. Added `HostDeclaration` (the host's structural self-description) and `checkPrecondition`, which runs all seven static checks and returns either `qualify` or a clean `non-start` with the failing conditions and a reason. No thresholds, no dependency on the loop/store/invariants.

---

### 12:00 — chore: scaffold TypeScript project and update CLAUDE.md
**Commit:** `21e8834`

Initialized dil-core with package.json, tsconfig.json, .gitignore, and src/. Added MUST commit rule to CLAUDE.md.

---
