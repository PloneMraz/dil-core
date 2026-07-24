/**
 * HostDeclaration — the host's structural self-description.
 *
 * Per the sovereign principle (CONTEXT.md §5, AGENTS.md "Requisition in code"),
 * DIL does not build adapters the host must conform to. The host *declares*
 * where its faculties are and what structural capacities it affords; DIL reads
 * this declaration. This file fixes the shape of that declaration.
 *
 * Each field maps to exactly one precondition checked by the gate (protocol §4):
 * the gate's job is to read these structural facts — all answerable *before* the
 * loop runs — and answer qualify / non-start.
 *
 * Note: the host declaration *format* is not one of the deferred DECIDE@IMPL
 * constants (protocol §12, tags A–G concern data representations, thresholds,
 * anchors, store internals). It is configuration structure, defined here.
 * Concrete per-channel transducers remain DECIDE@IMPL (protocol §6.3, T3) and
 * are out of scope for the precondition gate.
 */

/**
 * A declared channel in the host's region. E2 is measured on the pair
 * (agent, region): the test is whether the region can return *anything at all*,
 * not whether an Other is present.
 */
export interface ChannelDeclaration {
  /** Stable identifier for this channel. */
  readonly id: string;
  /**
   * Can this channel return anything other than silence?
   * A region whose channels never return is a void field (protocol §4, E2).
   */
  readonly canReturn: boolean;
}

/**
 * Optional probe handle for E3/P(b): the host declares how its store can be
 * written and read back, and the GATE performs the round-trip (the host does
 * not attest its own probe result). Absent handle ⇒ the condition is graded
 * `declared` instead of `probed` (precondition/decisions.ts).
 */
export interface StoreProbe {
  write(key: string, value: string): void;
  read(key: string): string | undefined;
}

/**
 * Optional probe handle for E4: the host declares how a trace can be left and
 * read back externally; the gate leaves a marker and reads for it.
 */
export interface TraceProbe {
  leave(marker: string): void;
  read(): readonly string[];
}

/**
 * One item of the host's pre-existing content, offered for admission at startup.
 * DIL does NOT import host content wholesale: on startup it scans this and forces
 * every item through the tagging-gate — vetted and stamped provenance `prior` —
 * before anything enters the store (§9, no side door). The host supplies the raw
 * `payload` and its *descriptive* open tags (which MUST satisfy the gate: include
 * `domain`, ≥3 tags, no verdict); DIL owns the stamping.
 */
export interface PreexistingItem {
  /** A stable id/key this item takes in `[data]`. */
  readonly id: string;
  readonly payload: unknown;
  /** Descriptive open tags (must satisfy the tagging-gate: `domain`, ≥3, no verdict). */
  readonly open: Readonly<Record<string, string>>;
  /** The admitting layer (default 1, T1 ingestion). */
  readonly admittingLayer?: number;
}

/**
 * The host's pre-existing memory, declared so DIL can scan it at startup. DIL
 * reads the host's declaration of *where* its content is; it does not assume the
 * host's storage format. Every scanned item is vetted + stamped `prior`.
 */
export interface PreexistingMemory {
  scan(): Iterable<PreexistingItem>;
}

export interface HostDeclaration {
  /**
   * E1 — Differentiability. A boundary permitting an internal/external
   * distinction to be drawn. The drawing itself is T2's work, not the host's;
   * the host need only afford the boundary.
   */
  readonly boundary: { readonly present: boolean };

  /**
   * E2 — Interaction. The region's channels. The threshold is minimal but
   * non-zero: at least one return other than silence. Zero channels, or
   * channels that all never return, is a void field and fails E2.
   */
  readonly channels: readonly ChannelDeclaration[];

  /**
   * E3 — Temporal accumulation (and P(b), the same condition restated for
   * bootstrap). State held across cycles so history accrues — accrual, not
   * loading (INV-5).
   */
  readonly store: {
    readonly persistsAcrossCycles: boolean;
    readonly probe?: StoreProbe;
    /**
     * The host's *raw durable substrate* location — a directory/partition on its
     * native storage that DIL requisitions and imposes its store law on (layout,
     * DIL-CLAIM, [data]/[event]/commits). This is NOT a store abstraction DIL
     * conforms to; it is raw physical memory DIL rules. Absent ⇒ DIL runs on an
     * in-memory fixture (test / throwaway minimal host), never a real deployment.
     */
    readonly root?: string;
    /**
     * The host's pre-existing content, scanned at startup and admitted through
     * the tagging-gate as `prior` (no side door). Absent ⇒ nothing pre-exists to
     * admit (a fresh minimal host).
     */
    readonly preexisting?: PreexistingMemory;
  };

  /**
   * E4 — Observable projection. Every action leaves an externally readable
   * trace.
   */
  readonly trace: {
    readonly externallyReadable: boolean;
    readonly probe?: TraceProbe;
  };

  /**
   * P(a) — emission. Can the host emit a first action at cycle-0 at all?
   * This checks the *capacity to emit*, not whether the emission is
   * distinguishable from ambient fluctuation — that is T2's later work.
   */
  readonly emitter: { readonly canEmitFirstAction: boolean };

  /**
   * P(c) — no self-wipe. The host must lack the defect of wiping its own state
   * clean on every mismatch; otherwise no scar survives. `true` here names the
   * defect being present (a stateless-reset-per-call host), which fails P(c).
   */
  readonly resilience: { readonly wipesStateOnMismatch: boolean };
}
