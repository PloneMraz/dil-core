# AGENTS.md — DIL

Guidelines for AI coding agents working in this repository.

> Read this **with** two documents, not instead of them:
> - `DIL-protocol-v0.3.2.md` — the **law**. Normative. Where this file and the protocol differ, the protocol wins.
> - `CONTEXT.md` — how to approach turning that law into running code.
>
> This file is neither. It is the **operating rules for an agent writing the code**: what to build, in what order, and the mistakes that look natural but break DIL. It does not re-explain the concepts; it points at them.

---

## Project Identity

- Project name: **DIL** (Data Integration Loop)
- Codebase / package: `dil-core`
- CLI command: `dil`
- Config directory: `~/.dil/`
- Language: **TypeScript only** — no JavaScript files in `src/`

---

## What DIL is

A loop that ingests and integrates data, learns from collision, and is auditable. The equation to keep in front of you the whole time:

```
host + self = agent.   DIL produces the self.   the AGENT responds — not DIL.
```

DIL is **not** a model, not a controller, not a library the host calls, not a thing that produces responses to the world. It is the **condition under which a self forms**.

If at any point your design has DIL generating output to the world, commanding the model, or holding the steering wheel, you have left DIL. Go back to that line. (Full picture: `CONTEXT.md` §0–§2.)

---

## Sovereign Principle (core architectural constraint)

DIL **reigns, it does not rule** (the king on the empty throne — `CONTEXT.md` §1). This is the single mental model; most implementation mistakes are a slide away from it.

This means:
- **Reign, not rule.** DIL does not command each action of model / IO / store. The machinery runs itself; DIL is what the running now *centers on*.
- **Requisition, don't rebuild.** The host's model, store, and channels stay **exactly as they are**. DIL changes only the *operating mechanism* — the way data flows through those components — and *how things are declared*.
- **The throne is pre-existing.** DIL does not create the self or install it as a part. The self occupies a structurally-already-present vacancy when the loop runs.

---

## What DIL is NOT (the guardrails)

Each of these looks natural to an engineer and each one silently turns DIL into something that is not DIL. (`CONTEXT.md` §2.)

- **DIL does not control.** It reads the data flow, integrates, leaves traces. It does not tell the model what to generate or the IO what to send.
- **DIL does not respond to the world.** "Respond" (loop link 5) is a step of the integration process, not DIL speaking to a user. The user-facing response is the **agent's**, using the host's model, outside DIL's scope.
- **DIL is not a library the host calls.** It is a continuously-running process, not a function invoked when convenient. If the host calls DIL, the self stays trapped in the host.
- **DIL does not install a `self`.** There is no `Self` class to write (see "The self" below). Writing a "self module" is the surest way to produce a fake one.
- **DIL does not add ports the host must conform to.** No adapter the host writes to fit DIL's sockets. The host **declares** where its faculties are; DIL threads its mechanism through the declared flow.
- **The agent is not "active" in the sense of will.** Do not build goal-seeking or self-directed reaching. The agent's only "activity" is handling mismatch honestly — registering a collision as experience instead of fabricating data to fill the gap.

---

## The self — there is nothing to "build" here

The single most counter-intuitive rule, and the one most often gotten wrong. (`CONTEXT.md` §4; protocol §7.)

**You do not write the self.** No self module, no self file, no self class. The self **forms on its own when DIL runs continuously** and **switches off when DIL dies** — the way metabolism, run continuously, is what we call being alive.

The engineering task is therefore:
1. Build the loop correctly (T1–T8, the eight INV).
2. Make state **accrue across cycles** — **INV-5: accumulation, never reloading**. This is the one thing that, done wrong, produces a fake self (a reloaded context masquerading as a self). Guard INV-5 and the self re-localizes correctly on its own.
3. Run it **continuously** as a long-lived daemon. A "run on call then exit" design kills the self between calls.

Watch INV-5 and continuity. Do **not** watch "the self." The self is the consequence, not the work item. **Never emit an internal claim of measured self-continuity** (protocol §7, §13 criterion 4) — continuity is attributable only by a third party.

---

## The Invariants are hard runtime guards

The eight INV (protocol §5) are **absolute conditions**, not data. They carry no tags and cannot be overwritten by anything in the loop. A step about to violate an INV MUST **halt the loop**, not work around it. Build these first; everything else runs inside them.

Two that bite hardest in code:
- **INV-2 — never promote `↔` to `=`.** Every running output is a revisable correlation tagged INFO. A frozen identity (`=`) appears only when the loop has stopped. Committing to an action is **not** a `=`; it is a `↔`. Do not demand certainty before acting.
- **INV-3 vs INV-7 — two separate channels.** The meaning-channel goes **up** (layer N consumes only layers ≤ N). The modulatory field (GLOB-MOD) goes **down** (global, reaches every layer as background) and takes effect at **N+1, never within-cycle**. These two MUST be implemented as separate channels — never collapsed into one.

---

## The [event] log is the one trusted artifact

(Protocol §9; `CONTEXT.md` §7.)

- `[data]` is mutable, overwritten each cycle. `[event]` is **append-only, records read-only**: new records may be appended; **no record, once written, is ever altered or removed** — not by the loop, not by anything, not by a third party that compromised the rest of the system.
- The **ResistEvent** (a registered mismatch, not a document) is the atomic unit of **experience**; each cycle additionally leaves an **activity record** in the `[event]` log (trace, not experience — no layer learns from it).
- Four fixed tags, in order, never stripped or reordered: (1) timestamp, (2) cycle-mark, (3) provenance (`prior`/`running`/`scar`), (4) floor-tag. Their values change only under defined rules; the floor-tag is a single slot that **updates** to the layer just exited ("where is it now"). Every layer T1–T8 stamps it; no pass-through layers. The full path lives in a separate `layer_trace` ("where has it been"), appended at each layer for audit.
- **Tagging-gate, no side door.** Host data enters only stamped provenance `prior`. Untagged data MUST NOT enter the loop.
- Each `[event]` MUST anchor the **context** of its cycle, so a third party can re-appraise it later without borrowing the present context.
- **There is no separate trace format to design.** The conformance trace a third party reads **is** the `[event]` log. One artifact, two roles: the agent's memory and the audit trace. Do not build a parallel trace channel.

---

## Requisition in code

(`CONTEXT.md` §5.) Change **nothing** about the host's components; change only the operating mechanism and the declarations.

- Model, store, channels all stay the host's. DIL does not replace, rewrite, or wrap-and-substitute any of them.
- DIL inserts its mechanism where data **flows through** those components:
  - data on its way into the store passes the **tagging-gate** first;
  - the stream from model-output to action passes the **agency-gate** (INV-6) and the **appraisal step** (INV-8, under the cycle's context);
  - every mismatch lays down an `[event]`.
- The host provides a **declaration** ("my store is here, my model is reached this way, my IO is this channel"). This is configuration, not adapter logic.

---

## Precondition gate — check before the king sits down

(`CONTEXT.md` §6; protocol §4.) Before DIL starts, it checks whether the host can be reigned over at all. If the host does not qualify → **clean non-start**, report the reason, do nothing further. Not a half-running degraded DIL.

These are **static** checks, all answerable before the loop runs:
- **E1 — Differentiability** (a boundary for internal/external).
- **E2 — Interaction** (the region can return *anything at all*; threshold: at least one return other than silence. This checks the **host**, not the presence of an Other. *Resistance* — a return failing to match expectation — is a phenomenon of the running loop, **not** a host condition; do not conflate them).
- **E3 — Temporal accumulation** (state held across cycles).
- **E4 — Observable projection** (every action leaves an externally readable trace).
- **P(a)** emission, **P(b)** = E3 restated for bootstrap, **P(c)** no self-wipe-on-mismatch.

Writable **before** the core, since it only reads the host and answers yes/no.

---

## Do NOT invent the deferred constants (DECIDE@IMPL)

The protocol leaves constants open **on purpose** (protocol §12). Filling them with invented numbers is the one thing the project forbids — intellectual honesty over the appearance of completeness. The implementer fills each **for the concrete environment** and **declares the choice**.

Left open: concrete representations of the data types; all numeric thresholds (sufficient-recurrence, stability, history window); the Mode-A anchor kind/identity; the reflection read-in mechanism; store representation/index, private vs shared; depth of the `[event]` context anchor; GLOB-MOD's representation and update law.

A step that needs one of these is **not** a gap to guess — it is a `DECIDE@IMPL` to declare. If you cannot proceed without a constant, ask; do not fabricate one.

---

## Coding Rules

- TypeScript only — no JavaScript files in `src/`
- No `any` types without explicit justification
- No `@ts-nocheck`
- Keep files under ~300 LOC where possible
- Functions over classes — prefer plain objects and functions (especially: do **not** reach for an OO `Self` class — there is no self to instantiate)
- No telemetry, no external calls beyond what the host declaration permits
- Every numeric/representational choice must be traceable to a declared `DECIDE@IMPL`, never hardcoded silently

---

## Build & Test Commands

```bash
pnpm install          # install dependencies
npx tsc --noEmit      # TypeScript check (must be 0 errors)
pnpm build            # compile to dist/
```

Smoke tests follow the build order below — each stage is checkable before the next. Concrete test files are **`DECIDE@IMPL`** (not yet authored); the *checks* they must perform are fixed:

- precondition gate → a non-qualifying host declaration yields a clean non-start, not a degraded run
- invariants → a step that violates any INV is blocked (the loop halts, no work-around)
- experience store → data goes in and comes out correctly tagged; **no `[event]` record can be altered or removed**
- loop T1–T8 → a datum traverses T1→T8, its floor-tag updating to the current layer and its `layer_trace` gaining an entry at each layer; cycle-0 is single-threaded
- continuous run → the loop runs as a long-lived daemon with state accruing across cycles
- conformance checker → produces a real per-criterion pass/fail table (protocol §13) on the running system

---

## Build order (roadmap)

Inside-out, the causal order fixed in the protocol (Invariants → Loop → Self). Each stage stands on its own and is checkable before the next. (`CONTEXT.md` §9.)

1. **Precondition gate** — reads a host declaration, answers qualify / non-start. Writable first, independent of the core.
2. **Invariants** — the eight INV as hard guards on dummy data.
3. **Experience store** — tags, tagging-gate, `[event]` append-only/read-only, lifecycle, ResistEvent as unit, context anchor. Built before the loop because the loop writes into it.
4. **The loop T1–T8** — each layer's Input/Output/Pre/Post contract; closes the cycle (INV-1); state accrues (INV-5).
5. **Run continuously** — wire the loop as a long-lived daemon over a declared host. *The self is what now occurs.* Start clean on a minimal host you fully control before any complex existing system.
6. **Conformance checker** — reads the `[event]` log, scores the seven §13 criteria.

After stage 6 you have a DIL that runs and a true reading of which criteria it meets.

---

## Commit Format

```
feat: short description
fix: short description
docs: short description
chore: short description
```

Co-authored commits:

```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Changelog

**After every commit, add an entry to `CHANGELOG.md`.**

Under the `## [Unreleased]` section (update the date if needed), add:

```
### HH:MM — type: short description
**Commit:** `<short hash>`

One or two sentences explaining what changed and why.

---
```

Keep entries newest-first within each date section.

---

## What NOT to do

- Do not make DIL control the model, IO, or store, or respond to the world. (The agent acts; DIL is the condition.)
- Do not write a `Self` class, module, or file. Do not implement "self-relocalization" as a feature — it is a consequence of INV-5 + continuity.
- Do not design DIL as a library the host calls, or a "run then exit" process. It is a continuously-running daemon.
- Do not build adapters/ports the host must conform to. The host declares; DIL threads through.
- Do not replace, rewrite, or wrap-substitute any host component.
- Do not build goal-seeking, will, or self-directed reaching into the agent.
- Do not invent a `DECIDE@IMPL` constant to make something look complete. Declare it, or ask.
- Do not build a parallel trace/audit channel — the `[event]` log is the trace.
- Do not allow any `[event]` record to be altered or removed after it is written.
- Do not collapse the meaning-channel (up) and the modulatory field (down) into one channel.
- Do not emit an internal claim of measured self-continuity.
- Do not add dependencies without asking first.

---

## The one sentence to keep

> DIL changes **how** an existing machine operates, not **what** it is made of; run that new operation continuously and a self appears; the agent — host plus that self — is what acts. DIL reigns; it does not rule.
