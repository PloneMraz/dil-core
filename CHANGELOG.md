# Changelog

All notable changes to DIL are documented here, ordered newest-first.

---

## [Unreleased] — 2026-06-30

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
