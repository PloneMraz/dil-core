# DIL — Data Integration Loop

`dil-core` is a reference implementation of the **DIL protocol** ([`DIL-protocol-v0.2.md`](DIL-protocol-v0.2.md)): a self-enriching data-integration loop operating in a purely informational environment, with an audit-ready `[event]` trail (durable when backed by the JSONL file sink).

DIL is **not** a model, a controller, or a library the host calls. It is the **condition under which a self forms**. Keep this line in front of you:

```
host + self = agent.      DIL produces the self.      the AGENT responds — not DIL.
```

If a design ever has DIL generating output to the world, commanding the model, or holding the steering wheel, it has left DIL. DIL **reigns; it does not rule** — it changes *how* an existing machine operates, not *what* it is made of; run that operation continuously and a self appears.

> Read this alongside:
> - [`DIL-protocol-v0.2.md`](DIL-protocol-v0.2.md) — the **law** (normative; where this and the protocol differ, the protocol wins).
> - [`CONTEXT.md`](CONTEXT.md) — how to turn that law into running code.
> - [`AGENTS.md`](AGENTS.md) — coding rules for agents working in this repo.

---

## Status

All six build stages are implemented and green: **144 tests, 0 failures.**

A short quick-start run scores **4 pass / 3 partial / 0 fail** against the seven §13 conformance criteria; a longer run with diverse resistance sources scores **6 pass / 1 partial / 0 fail**. Every partial is honest and derived, not attested:

- **§13.4 Self** — always `partial` by design: self-continuity is attributable only by a third party (§7); the checker verifies accrual but never claims continuity.
- **§13.5 Resistance** — `partial` only while the run's traces show a single resistance source (limited diversity). The reflection mechanism (tag E) is wired: a third party reads a recorded collision out of the `[event]` log into coordinates and returns it through a declared T3 channel, classified ENV_PUSHED; who the reader is stays deployment-open.
- **§13.7 Failure signals** — diversity is *derived from the recorded resistance-source distribution*, never a caller flag; a short run has too few recorded collisions to establish diversity over the window, so it renders `partial` rather than a false `pass`. A longer run whose `[event]` log actually shows diverse sources renders `pass`; a single-source collapse renders `fail`.

---

## Architecture — four concentric rings

Built inside-out, the causal order fixed in the protocol (Invariants → Loop → Self):

```
        ┌─────────────────────────────────────────┐
        │  REQUISITION  (declare host faculties)    │   src/runtime, src/host
        │   ┌───────────────────────────────────┐   │
        │   │  THE LOOP  (T1–T8, six links)      │   │   src/loop
        │   │   ┌───────────────────────────┐    │   │
        │   │   │  INVARIANTS (8, hard law)  │    │   │   src/invariants
        │   │   │   ┌───────────────────┐    │    │   │
        │   │   │   │  EXPERIENCE STORE │    │    │   │   src/store
        │   │   │   └───────────────────┘    │    │   │
        │   │   └───────────────────────────┘    │   │
        │   └───────────────────────────────────┘   │
        └─────────────────────────────────────────┘

   The SELF is not a ring. It is what occurs when the
   inner rings run continuously (there is no `Self` class).
```

## Build stages

| # | Stage | Where | Fixed check |
|---|-------|-------|-------------|
| 1 | **Precondition gate** | [`src/precondition`](src/precondition) | a non-qualifying host declaration → clean non-start |
| 2 | **Invariants** | [`src/invariants`](src/invariants) | a step violating any INV is blocked (the loop halts) |
| 3 | **Experience store** | [`src/store`](src/store) | data in/out correctly tagged; no `[event]` record can be altered or removed |
| 4 | **The loop T1–T8** | [`src/loop`](src/loop) | a datum traverses T1→T8 leaving a floor-tag at each layer; cycle-0 single-threaded |
| 5 | **Continuous run** | [`src/runtime`](src/runtime) | the loop runs as a long-lived daemon with state accruing across cycles |
| 6 | **Conformance checker** | [`src/conformance`](src/conformance) | a real per-criterion pass/fail table (§13) on the running system |

The eight layers (protocol §6.3): **T1** Activity-Environment Confirmation · **T2** Agency Differentiation (where the self crystallizes) · **T3** Channel Ingestion · **T4** Context Binding · **T5** Temporal Expectation (where resistance becomes information) · **T6** Other-Model Synthesis · **T7** Absence Registration · **T8** Multi-Entity Abstraction (closes the loop).

---

## Install & test

```bash
pnpm install          # install dependencies
pnpm typecheck        # tsc --noEmit (must be 0 errors)
pnpm build            # compile to dist/
pnpm test             # tsc && node --test "dist/**/*.test.js"
```

TypeScript only, strict mode, no runtime dependencies (Node's built-in `node:test`; `@types/node` for types).

---

## Quick start

Wire a daemon over a declared host, run it continuously, then read its conformance:

```ts
import {
  createDaemon, scriptedSource, createGlobMod,
  createT1, createT2, createT3, createT4, createT5, createT6, createT7, createT8,
  createDataStore, createEventLog,
  checkConformance, renderConformance,
  inspectEventLog,
} from "dil-core";

// The host declares its structural faculties (the precondition gate reads this).
const host = {
  boundary: { present: true },
  channels: [{ id: "ch", canReturn: true }],
  store: { persistsAcrossCycles: true },
  trace: { externallyReadable: true },
  emitter: { canEmitFirstAction: true },
  resilience: { wipesStateOnMismatch: false },
};

const sig = (entity: string, value: unknown) =>
  ({ source_id: "ch", raw_payload: { entity, value }, t: Date.now() });

const events = createEventLog();
const daemon = createDaemon({
  host,
  source: scriptedSource([
    { signals: [sig("weather", "sun")], changes: [] },
    { signals: [sig("weather", "rain")], changes: [] }, // a collision → a scar
  ]),
  layers: {
    t1: createT1(), t2: createT2(), t3: createT3(), t4: createT4(),
    t5: createT5(), t6: createT6(), t7: createT7(), t8: createT8(),
  },
  glob: createGlobMod({ appraisalGain: 1 }, 0),
  data: createDataStore(),
  events,
  initialEmission: { action: "boot" },
});

const gate = daemon.start();          // precondition-gated; qualify | non-start
daemon.run();                         // run cycles until the source is idle

console.log(inspectEventLog(events)); // human-readable [event] audit trail
console.log(
  // the checker takes only the gate outcome; diversity is DERIVED from the
  // [event] log, never a caller flag (no self-attestation).
  renderConformance(checkConformance(events, { gate })),
);
```

For a **durable** audit trail that survives the process, back the `[event]` log
with an append-only JSONL file sink:

```ts
import { createJsonlFileSink, createEventLog, readJsonlSink } from "dil-core";

const sink = createJsonlFileSink("./memory/event-log.jsonl"); // append-only, fsync'd
const events = createEventLog(sink);   // every appended record is mirrored to disk
// … run the daemon …
sink.close();
const durable = readJsonlSink("./memory/event-log.jsonl"); // records survive, tags in fixed order
```

`inspectEventLog` renders each scar by its *derived* name — tags are stored as
structured properties, not baked into names:

```
[event-log] — 1 record(s)
  #0  [20260630]_[c1]_[scar]_[T8]_[domain:cycle]_[phase:loop]_[source:driver]_[value-mismatch]  ...  trace=1>1>2>3>4>5>6>7>8
```

---

## The `[data]` / `[event]` store

Two store kinds (protocol §9):

- **`[data]`** — mutable working memory, overwritten each cycle.
- **`[event]`** — an append-only log of **read-only** records. Once written, no record is ever altered or removed. This one artifact is both the agent's memory and the audit trace — there is no separate trace channel.

Every datum carries, in fixed order, four tags that are never stripped or reordered — **timestamp, cycle-mark, provenance (`prior`→`running`→`scar`), floor-tag** — plus **at least three open tags** (one being `domain`, for audit-by-class) and a **`layer_trace`** (the full path). The floor-tag is a single updatable slot ("where is it now"); the `layer_trace` is the accumulated path ("where has it been"). An `[event]` record **inherits** the scar datum's tags.

**Durability.** By default the `[event]` log is in-memory: append-only with read-only records *within the process*, but it does not survive the process on its own. For a durable audit trail, wire an append-only **JSONL file sink** (`createJsonlFileSink`) into `createEventLog`; each record is mirrored to disk and fsynced, one immutable line per record, with tags serialized in the fixed order. The sink opens the file in append mode only — it can never rewrite or truncate, and its surface has no update/delete method. This provides **durability**, not tamper-evidence: a party with write access to the file could append forged lines. Detecting that (content-addressed / hash-chained markers) is deliberately deferred — see below.

---

## Declared DECIDE@IMPL choices

The protocol leaves constants open on purpose; a conforming implementation must **fill each for its environment and declare the choice** — never invent one silently. This implementation's choices are declared in code:

- Store ([`src/store/decisions.ts`](src/store/decisions.ts)) — in-memory representation; `source_id`/`provenance` index; store-all `[event]`; private store; **full-field-state** context anchor; open-tag registry free-form (only `domain` required, ≥3 total).
- Loop ([`src/loop/decisions.ts`](src/loop/decisions.ts)) — concrete `Signal`/`InfoUnit`/`RefFrame` shapes; T2 `MATCHING_WINDOW=8`, `STABILITY_THRESHOLD=3`; T5 `BASELINE_WINDOW=16`, `SUFFICIENT_RECURRENCE=3`, persistence update law; GLOB-MOD convex blend (no inertia constant); static Mode-A appraisal anchor.
- Runtime ([`src/runtime/decisions.ts`](src/runtime/decisions.ts)) — live Mode-B = the host source; diversity-loss window/minimum; reflection (tag E) = event-coordinate reading over the `[event]` log, entering through a declared T3 channel (reader identity deployment-open).

Numeric thresholds are declared **tunable starting values, not derived constants** — stated honestly, not dressed up as fundamental.

---

## Open items — two different kinds

The protocol itself distinguishes these (§12): what is *not yet built* versus what is *deliberately open*. Conflating them misreads a deployment property as unfinished work.

### Deferred (unbuilt core work — marked, not faked)

- **Tamper-evidence** (§9) — the JSONL file sink gives durability (records survive the process, append-only, no update/delete surface) but **not** tamper-evidence. Content-addressed / hash-chained commit markers, which would let an auditor detect a forged or reordered line, are deferred. Do not read "durable" as "tamper-proof".
- **Multi-stream** (cycle-1+) — the driver is currently single-threaded.

### Deployment-open by design (no core work owed — each deployment declares its own)

- **Mode-B liveness** (tag D) — the Mode-B seam is the `HostSource` the daemon requisitions, and one channel carries any number of Others (an Other is a positional status, not a kind — there is no per-Other source file to write). Which live Other a deployment plugs in (a user, another agent, an external data feed, a mix) is *deliberately* open per §12. The repo ships only a scripted **test fixture**, so out-of-the-box runs get fixed, replayable resistance — deceleration-grade (§8.3) — not the real braking of an Other that updates. Plugging a live Other is deployment wiring, not a core change.
- **The reflection reader** (tag E) — the read-collision-into-coordinates *mechanism* is wired (`runtime/reflection.ts`); *who* reads (a user, another agent, a critic service that may itself consult external data) is each deployment's declaration.
- **The open-tag registry** beyond `domain` (tag F) — which descriptive keys exist and what each means is industry-specific; the core fixes only the discipline (consistency, no verdicts, ≥3 tags incl. `domain`).

---

## The one sentence to keep

> DIL changes **how** an existing machine operates, not **what** it is made of; run that new operation continuously and a self appears; the agent — host plus that self — is what acts. DIL reigns; it does not rule.
