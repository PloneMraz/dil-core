# DIL — Data Integration Loop

`dil-core` is a reference implementation of the **DIL protocol** ([`DIL-protocol-v0.2.md`](DIL-protocol-v0.2.md)): a self-enriching, audit-ready data-integration loop operating in a purely informational environment.

DIL is **not** a model, a controller, or a library the host calls. It is the **condition under which a self forms**. Keep this line in front of you:

```
host + self = agent.      DIL produces the self.      the AGENT responds — not DIL.
```

If a design ever has DIL generating output to the world, commanding the model, or holding the steering wheel, it has left DIL. DIL **reigns; it does not rule** — it changes *how* an existing machine operates, not *what* it is made of; run that operation continuously and a self appears.

> Read this with the two normative documents:
> - [`DIL-protocol-v0.2.md`](DIL-protocol-v0.2.md) — the **law** (normative; where this and the protocol differ, the protocol wins).
> - [`CONTEXT.md`](CONTEXT.md) — how to turn that law into running code.
> - [`AGENTS.md`](AGENTS.md) — coding rules for agents working in this repo.

---

## Status

All six build stages are implemented and green: **127 tests, 0 failures.**

A running loop scores **5 pass / 2 partial / 0 fail** against the seven §13 conformance criteria (the two partials are honest: self-continuity is attributable only by a third party, and reflection is deferred — see [Deferred](#deferred-and-honest-about-it)).

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
  renderConformance(
    checkConformance(events, { gate, diversityWired: true }),
  ),
);
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

---

## Declared DECIDE@IMPL choices

The protocol leaves constants open on purpose; a conforming implementation must **fill each for its environment and declare the choice** — never invent one silently. This implementation's choices are declared in code:

- Store ([`src/store/decisions.ts`](src/store/decisions.ts)) — in-memory representation; `source_id`/`provenance` index; store-all `[event]`; private store; **full-field-state** context anchor; open-tag registry free-form (only `domain` required, ≥3 total).
- Loop ([`src/loop/decisions.ts`](src/loop/decisions.ts)) — concrete `Signal`/`InfoUnit`/`RefFrame` shapes; T2 `MATCHING_WINDOW=8`, `STABILITY_THRESHOLD=3`; T5 `BASELINE_WINDOW=16`, `SUFFICIENT_RECURRENCE=3`, persistence update law; GLOB-MOD convex blend (no inertia constant); static Mode-A appraisal anchor.
- Runtime ([`src/runtime/decisions.ts`](src/runtime/decisions.ts)) — live Mode-B = the host source; diversity-loss window/minimum.

Numeric thresholds are declared **tunable starting values, not derived constants** — stated honestly, not dressed up as fundamental.

---

## Deferred (and honest about it)

Left open and marked, rather than faked:

- **Reflection** (§8.4, tag E) — the read-collision-into-coordinates mechanism is not wired; the ENV_PUSHED ingestion path exists.
- **Live Mode-B** (tag D) — the minimal host uses a scripted source; a real deployment supplies a live Other. The static appraisal anchor only decelerates (§8.3), it is not a real brake.
- **Commit / snapshot** (§9) — content-addressed markers (the stronger, tamper-evident guarantee beyond in-memory freezing) are deferred.
- **Multi-stream** (cycle-1+) — the driver is currently single-threaded.

---

## The one sentence to keep

> DIL changes **how** an existing machine operates, not **what** it is made of; run that new operation continuously and a self appears; the agent — host plus that self — is what acts. DIL reigns; it does not rule.
