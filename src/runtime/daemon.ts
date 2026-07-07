/**
 * The daemon — run the loop continuously (CONTEXT.md §4; stage 5), now with the
 * §9 commit/snapshot/recovery mechanism.
 *
 * "Run it continuously as a long-lived process. The self exists only while the
 * loop runs; a 'run on call then exit' design kills the self between calls." The
 * daemon holds ONE persistent cycle instance and drives it over a HostSource, so
 * state accrues across cycles (INV-5) and the causal line is unbroken. It makes
 * no internal claim of self-continuity (forbidden, §7); continuity is for a third
 * party to attribute from the [event] traces.
 *
 * Startup is precondition-gated (stage 1): if the host does not qualify, the
 * daemon does NOT start — a clean non-start, not a degraded run.
 *
 * Commits (§9): when a CommitStore is wired, a commit fires automatically after
 * COMMIT_EVERY scars since the last one (the [event] log acts as the counter;
 * scar-rhythm is the author's declared choice), always at a cycle boundary.
 * `commit()` is the manual, out-of-loop trigger. Recovery: pass `recoverFrom`
 * (a marker hash) — the FULL system state is restored before the gate runs, a
 * FORK MARKER (parent = recoveredFrom) is written on start, and the [event] log
 * is NOT rolled back: it keeps recording straight through. The rollback
 * DECISION is a third party's (read from the scars); the daemon only supplies
 * the mechanism — it never rolls itself back.
 */

import { checkPrecondition, type GateResult } from "../precondition/gate.js";
import type { HostDeclaration } from "../host/declaration.js";
import { createCycle, type CycleDeps, type CycleResult, type DriverState } from "../loop/cycle.js";
import {
  MATCHING_WINDOW,
  STABILITY_THRESHOLD,
  BASELINE_WINDOW,
  SUFFICIENT_RECURRENCE,
} from "../loop/decisions.js";
import { COMMIT_EVERY } from "../store/decisions.js";
import type { CommitStore, CommitMarker } from "../store/commit-store.js";
import { takeSnapshot, restoreSnapshot, type SystemSnapshot } from "./commit.js";
import { createDiversityMonitor, type DiversityMonitor } from "./diversity.js";
import type { HostSource } from "./host-source.js";

export interface DaemonDeps extends CycleDeps {
  /** The host's structural declaration, checked by the precondition gate. */
  readonly host: HostDeclaration;
  /** The live source the daemon requisitions (the Mode-B Other, tag D). */
  readonly source: HostSource;
  /** Optional diversity monitor; one is created if omitted. */
  readonly diversity?: DiversityMonitor;
  /** Optional commit repo (store/commits/); without it no commits fire. */
  readonly commits?: CommitStore;
  /** The [event] sink's chain head, when a durable sink is wired (anchoring). */
  readonly chainHead?: () => string;
  /** Scars between automatic commits (DECIDE@IMPL COMMIT_EVERY by default). */
  readonly commitEvery?: number;
  /** RECOVERY: restore the full system from this marker before starting. */
  readonly recoverFrom?: string;
}

export interface Daemon {
  /** Run the precondition gate and, if the host qualifies, begin running. */
  start(): GateResult;
  /** Run one cycle if input is available and the daemon is running; returns whether it ran. */
  step(): boolean;
  /** Run cycles until the source is idle, the daemon is stopped, or maxCycles is reached. */
  run(maxCycles?: number): void;
  stop(): void;
  isRunning(): boolean;
  cyclesRun(): number;
  /** The current diversity-loss signal, or null (conformance criterion 7). */
  diversitySignal(): string | null;
  /** The result of the most recent cycle, or null before the first. */
  lastResult(): CycleResult | null;
  /** Manual, out-of-loop commit trigger; returns the marker hash, or null without a store. */
  commit(): string | null;
}

export function createDaemon(deps: DaemonDeps): Daemon {
  const commits = deps.commits;
  const commitEvery = deps.commitEvery ?? COMMIT_EVERY;

  // ── Recovery (before anything runs): restore the accrued state ──
  let resume: DriverState | undefined;
  let recoveredFrom: { hash: string; marker: CommitMarker } | null = null;
  if (deps.recoverFrom !== undefined) {
    if (!commits) throw new Error("recoverFrom requires a commit store");
    const marker = commits.getMarker(deps.recoverFrom);
    const snap = commits.getState(marker.stateHash) as SystemSnapshot;
    resume = restoreSnapshot(snap, deps.layers, deps.glob, deps.data);
    recoveredFrom = { hash: deps.recoverFrom, marker };
  }

  const cycle = createCycle({ ...deps, resume });
  const diversity = deps.diversity ?? createDiversityMonitor();
  let running = false;
  let last: CycleResult | null = null;
  let totalScars = recoveredFrom?.marker.scarCount ?? 0;
  let scarsSinceCommit = 0;

  function writeMarker(extra: Partial<Pick<CommitMarker, "recoveredFrom" | "stateHash">> = {}): string {
    const stateHash =
      extra.stateHash ??
      commits!.putState(takeSnapshot(deps.layers, deps.glob, cycle.snapshot(), deps.data));
    const marker: CommitMarker = {
      // A fork marker branches FROM the restored point (git semantics: the new
      // line's parent is where you checked out, not the abandoned tip).
      parent: extra.recoveredFrom ?? commits!.head(),
      ...(extra.recoveredFrom !== undefined ? { recoveredFrom: extra.recoveredFrom } : {}),
      chainHead: deps.chainHead?.() ?? null,
      eventCount: deps.events.size(),
      scarCount: totalScars,
      cycle: cycle.cycleCount(),
      at: Date.now(),
      stateHash,
      config: {
        MATCHING_WINDOW,
        STABILITY_THRESHOLD,
        BASELINE_WINDOW,
        SUFFICIENT_RECURRENCE,
        COMMIT_EVERY: commitEvery,
      },
    };
    scarsSinceCommit = 0;
    return commits!.putMarker(marker);
  }

  function step(): boolean {
    if (!running) return false;
    const input = deps.source.next();
    if (input === null) return false;
    const result = cycle.run(input);
    deps.source.deliver(result.response);
    diversity.observe(result.collisionSources);
    last = result;
    totalScars += result.scars;
    scarsSinceCommit += result.scars;
    // §9: the counter fires a commit after COMMIT_EVERY scars, at a cycle boundary.
    if (commits && scarsSinceCommit >= commitEvery) {
      writeMarker();
    }
    return true;
  }

  return {
    start(): GateResult {
      const gate = checkPrecondition(deps.host);
      // Pass all → the king sits, the loop starts. Fail any → clean non-start.
      if (gate.outcome === "qualify") {
        running = true;
        // Recovery stamps the fork instantly: parent = the marker restored
        // from, reusing its payload (the state IS that state — natural dedup).
        if (commits && recoveredFrom) {
          writeMarker({
            recoveredFrom: recoveredFrom.hash,
            stateHash: recoveredFrom.marker.stateHash,
          });
        }
      }
      return gate;
    },
    step,
    run(maxCycles = Infinity): void {
      let ran = 0;
      while (running && ran < maxCycles) {
        if (!step()) break; // source idle
        ran += 1;
      }
    },
    stop: () => void (running = false),
    isRunning: () => running,
    cyclesRun: () => cycle.cycleCount(),
    diversitySignal: () => diversity.signal(),
    lastResult: () => last,
    commit: () => (commits ? writeMarker() : null),
  };
}
