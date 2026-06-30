# Changelog

All notable changes to DIL are documented here, ordered newest-first.

---

## [Unreleased] — 2026-06-30

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
