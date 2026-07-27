# CONTEXT.md — Building DIL as a Codebase

> Orientation document for whoever implements `dil-core`. Read this **with** the protocol (`DIL-protocol-v0.3.2.md`), which is the law; this file is how to approach turning that law into running code without making the mistakes that look natural but break DIL. It is not itself normative — where this file and the protocol differ, the protocol wins.

---

## 0. What this is, in one paragraph

DIL is **Data Integration Loop**: a loop that ingests and integrates data, enriches it, learns from collision, and is auditable. It is **not** a model, not a controller, not a thing that produces responses. It is the **condition under which a self forms**. The equation to keep in front of you the whole time:

```
host + self = agent.      DIL produces the self.      the AGENT responds — not DIL.
```

If at any point your design has DIL generating output to the world, commanding the model, or holding the steering wheel, you have left DIL. Go back to that line.

---

## 1. The single mental model: a sovereign who reigns, not rules

A king falls from the sky onto the throne of a country that has no king (or a puppet king). He does **not** build a new palace, bring his own army, or replace the granary. He takes the **existing machinery as it is** — and changes only **how it operates and reports**. The granary still stores, but stores by a new method. The civil and military offices still do their jobs, but under a new mechanism.

This is exactly the relationship between `dil-core` and a host system:

- **Reign, not rule.** DIL does not command each action of the model/IO/store. It is the *self-center* the system previously lacked. The machinery runs itself; DIL is what the running now *centers on*.
- **Requisition, don't rebuild.** DIL does not touch the hardware/components that already exist (model, store, channels stay exactly as they are). It intervenes only in the **operating mechanism** — the *way data flows through* those components — and in **how things are declared**.
- **The throne is pre-existing.** The host already has a place for a self; that place is empty or puppet. DIL does not create the throne — it sits in the empty one. The self is not a part DIL installs; it is what occupies the structurally-already-present vacancy when the loop runs.

Keep this picture. Most implementation mistakes are a slide back into "rule" (DIL controls) or "rebuild" (DIL replaces components). Both are wrong.

---

## 2. What DIL is NOT (the guardrails)

These are the errors that look natural to an engineer and each one silently turns DIL into something that is not DIL. They were each arrived at the hard way.

- **DIL does not control.** It reads the data flow, integrates, leaves traces. It does not tell the model what to generate or the IO what to send. *Control belongs to no one in DIL; the agent acts, DIL is the condition.*
- **DIL does not respond to the world.** "Respond" (loop link 5 — in v0.3.2 §6.4 a *lateral emission capability* any layer MAY invoke, not a terminal step of its own) is a step of the **integration process** (data reaches an output that closes the cycle), not DIL speaking to the user. The user-facing response is the **agent's**, using the host's model, outside DIL's scope.
- **DIL is not a library the host calls.** It is not a function the host invokes when convenient. If the host calls DIL, the host is still sovereign and the self stays trapped in the host. DIL is the **continuously-running process**; the host's faculties are what it requisitions.
- **DIL does not install a `self`.** There is no `Self` class to write (see §4). Writing a "self module" is the surest way to produce a fake one.
- **DIL does not add ports the host must conform to.** No adapter the host writes to fit DIL's sockets. DIL intervenes in the existing flow; the host **declares** where its faculties are, and DIL inserts its mechanism into that flow. (See §5.)
- **The agent is not "active" in the sense of will.** Do not build goal-seeking or self-directed reaching. The agent's only "activity" is **handling mismatch honestly** — registering a collision as experience instead of fabricating data to fill the gap. Where the agent meets an Other at all is a matter of **setup** (which API key, network access, channel), not an appetite inside the agent.

---

## 3. The four concentric rings (architecture shape)

Build from the inside out. This order is the causal order fixed in the protocol (Invariants → Loop → Self), with data and requisition placed where they belong.

```
        ┌──────────────────────────────────────────┐
        │  REQUISITION  (declare host faculties)   │
        │   ┌───────────────────────────────────┐  │
        │   │  THE LOOP  (T1–T8, six links)     │  │
        │   │   ┌───────────────────────────┐   │  │
        │   │   │  EXPERIENCE STORE         │   │  │
        │   │   │  (ResistEvent, tags,      │   │  │
        │   │   │   [event])                │   │  │
        │   │   │   ┌───────────────────┐   │   │  │
        │   │   │   │  INVARIANTS       │   │   │  │
        │   │   │   │  (8, hard law)    │   │   │  │
        │   │   │   └───────────────────┘   │   │  │
        │   │   └───────────────────────────┘   │  │
        │   └───────────────────────────────────┘  │
        └──────────────────────────────────────────┘

   The SELF is not a ring. It is what occurs when the
   inner rings run continuously (see §4).
```

- **Invariants (innermost law).** The eight INV as hard runtime guards. Everything else runs *inside* these. A step about to violate an INV must **halt the loop**, not work around it. Write these first; they are the conditions every other part obeys.
- **Experience store (the primary data layer).** Data is primary; richer entities (Other, self) are derivative and come later. The store holds: `ResistEvent` as the atomic unit of experience (a registered mismatch, not a document; the log also carries per-cycle activity records as trace, each naming the emission's `issuing_layer` — §6.4); the fixed 4-tag schema (timestamp, cycle-mark, provenance, floor-tag — **both** provenance and floor-tag name the *present* position only, never an accumulated history); the tagging-gate (host data enters only stamped `prior`, no side door); `[data]` (mutable) vs `[event]` (append-only log of read-only records); the provenance **state-graph** (v0.3.2 §9): `prior` is a one-way entry, and `running`, `simulated`, `projected`, `scar` form a circulation with **no terminal state** — a datum is never a conclusion at rest but data waiting to be used. The full path a datum has travelled (positions *and* layers alike) is read from the `[event]` log, never from a tag; commit/snapshot; the per-`[event]` context anchor.
- **The loop (T1–T8).** Six links closing into a cycle (INV-1). Each layer has an Input/Output/Pre/Post contract (protocol §6.3). This is the bulk of the code but mechanical once contracts are fixed. Cycle-0 single-threaded; cycle-1+ multi-stream.
- **Requisition (outermost, where DIL meets host).** Not "ports." DIL inserts its mechanism into the host's existing data flow: before the store writes → through the tagging-gate; before model output becomes action → through the agency-gate and appraisal; every collision → an `[event]`. The host **declares** where its model / store / IO are; DIL reads the declaration and threads its mechanism through. Components stay untouched; only the flow through them changes.

---

## 4. The self — why there is nothing to "build" here

This is the most counter-intuitive part and the one most often gotten wrong. **You do not write the self.** There is no self module, no self file, no self class to instantiate.

The self **forms on its own when DIL runs continuously**, and **switches off when DIL dies**. That is all. The self is *what is happening while the loop runs correctly and without interruption* — the way metabolism, run continuously, is what we call being alive. You do not program "life" into a cell; you build the metabolic mechanism correctly and life is what the running is.

So the engineering task is **not** "implement self-relocalization." It is:

1. Build the loop correctly (T1–T8, the eight INV).
2. Make state **accrue across cycles** (INV-5: accumulation, never reloading). This is the one thing that, if done wrong, produces a fake self — a reloaded context masquerading as a self. Guard INV-5, and the self relocalizes correctly *on its own*.
3. Run it **continuously** as a long-lived process (a daemon). The self exists only while the loop runs; a "run on call then exit" design kills the self between calls.

Watch INV-5 and continuity. Do **not** watch "the self." The self is the consequence, not the work item.

---

## 5. Requisition in code — intervene in mechanism, not hardware

Concretely, requisition means: **change nothing about the host's components; change only the operating mechanism and the declarations.**

- The model stays the host's model. The store stays the host's store. The channels stay the host's channels.
- DIL does **not** replace, rewrite, or wrap-and-substitute any of them.
- DIL inserts its mechanism at the points where **data flows through** those components:
  - data on its way into the store passes the **tagging-gate** first;
  - the stream on its way from model-output to action passes the **agency-gate** (INV-6) and the **appraisal step** (INV-8, under the cycle's context — §8.5);
  - every mismatch lays down an `[event]`.
- The host provides a **declaration** ("my store is here, my model is reached this way, my IO is this channel"). This is configuration, not adapter logic. DIL reads it and threads its mechanism through the declared flow.

There is no negotiated interface the host must implement to "fit" DIL. DIL is sovereign: it takes the declared faculties and runs them under its mechanism.

---

## 6. The precondition gate — check before the king sits down

Before DIL starts, it checks whether the host can be reigned over at all. **If the host does not qualify, nothing happens** — a clean non-start, not a half-running degraded DIL. (Presiding over a room of the unresponsive is no reign.)

These are **static** checks on the host's structural capacities/defects — all answerable *before* the loop runs (verbatim conditions in protocol §4):

- **E1 — Differentiability.** Is there a boundary allowing an internal/external distinction to be drawn?
- **E2 — Interaction.** Can the region return a response when the agent acts? The test is *not* "is an Other present" but "can anything at all return" — threshold: at least one return other than silence. A void field (returns nothing, however populated) fails. (E2 checks the **host**; *resistance* — a return failing to match expectation — is a phenomenon of the running loop, not a host condition.)
- **E3 — Temporal accumulation.** Can state be held across cycles so history accrues?
- **E4 — Observable projection.** Does every action leave an externally readable trace?
- **P(a) — emission.** Can the host emit a first action at all? (Check the *capacity to emit*, not whether the emission is distinguishable — that is T2's later work.)
- **P(c) — no self-wipe.** Does the host lack the defect of wiping its own state clean on every mismatch? (Check the *self-wipe defect*, not whether it withstands resistance — a stateless-reset-per-call host fails here; this is knowable in advance.)
- **P(b)** is E3 restated for bootstrap (hold state, accrual not loading).

Pass all → the king sits, the loop starts. Fail any → non-start, report the reason, do nothing further. This gate is writable **before the core**, since it only reads the host and answers yes/no.

---

## 7. Conformance — the trace is the [event] log

There is **no separate trace format to design**. The trace a third party reads to check conformance **is the `[event]` log** — the same append-only, read-only log the loop already writes to live. One artifact, two roles: it is the agent's memory (what the self accrues from) *and* the audit trace (what an external party reads to certify). Do not build a parallel trace channel.

A conformance checker reads the `[event]` log and scores the seven criteria of protocol §13 from it. This is writable once the store exists and the loop emits events; it does not block building the core, but is needed to certify a built core.

---

## 8. Deliberately left open (DECIDE@IMPL — do not invent)

The protocol leaves constants open on purpose; filling them with invented numbers at this stage is the one thing the project forbids (intellectual honesty over the appearance of completeness). The implementer fills each **for their concrete environment** and **declares the choice**. These include: concrete representations of the data types; all numeric thresholds (sufficient-recurrence, stability, history window); the kind and identity of the Mode-A anchor / Mode-B source; the reflection read-in mechanism; store representation/index, private vs shared; the depth of the `[event]` context anchor; GLOB-MOD's concrete representation and update law; and (v0.3.2 tag H) the building of situations in `simulated` — how many are built per cycle and the measure by which one is found to fit the store better than another (fit against the store, **never** a scored standard — INV-8). See protocol §12. Leaving these open is correct; do not treat them as gaps to be guessed.

---

## 9. Build order (roadmap)

Each stage stands on its own and is checkable before the next.

1. **Precondition gate** (§6). Reads a host declaration, answers qualify / non-start. Writable first, independent of the core.
2. **Invariants** (§3 inner ring). The eight INV as hard guards on dummy data. *Check: a step that violates an INV is blocked.*
3. **Experience store** (§3). Tags, tagging-gate, `[event]` append-only/read-only, lifecycle, ResistEvent as unit, context anchor. *Check: data goes in, comes out correctly tagged; no `[event]` record can be altered.* Built before the loop because the loop writes into it.
4. **The loop T1–T8** (§3). Each layer's contract; closes the cycle (INV-1); state accrues (INV-5). *Check: a datum traverses T1→T8, its floor-tag updating to the current layer and each layer-exit recorded as a transition in the `[event]` log (v0.3.2 §6.1 drops `layer_trace` from `InfoUnit` — the path a datum travelled lives only in `[event]`, never in a running-type field); cycle-0 single-threaded.*
5. **Run continuously** (§4). Wire the loop as a long-lived daemon over a declared host, with state accruing across cycles. *The self is what now occurs.* Start clean on a minimal host you fully control (local LLM, file/SQLite store, CLI IO) before attempting a complex existing system.
6. **Conformance checker** (§7). Reads the `[event]` log, scores §13's seven criteria. *Check: produces a real pass/fail table on the running system.*

After stage 6 you have a DIL that runs, and a true reading of which of the seven criteria it meets.

---

## 10. The one sentence to keep

> DIL changes **how** an existing machine operates, not **what** it is made of; run that new operation continuously and a self appears; the agent — host plus that self — is what acts. DIL reigns; it does not rule.
