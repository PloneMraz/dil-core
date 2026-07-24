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
import { createCycle, type Cycle, type Layers, type CycleResult, type DriverState } from "../loop/cycle.js";
import type { Emission } from "../loop/layers/t2.js";
import type { GlobMod } from "../loop/glob-mod.js";
import {
  MATCHING_WINDOW,
  STABILITY_THRESHOLD,
  BASELINE_WINDOW,
  SUFFICIENT_RECURRENCE,
} from "../loop/decisions.js";
import { COMMIT_EVERY } from "../store/decisions.js";
import type { CommitStore, CommitMarker } from "../store/commit-store.js";
import type { DataStore } from "../store/data-store.js";
import type { EventLog } from "../store/event-log.js";
import { takeSnapshot, restoreSnapshot, type SystemSnapshot } from "./commit.js";
import { createDiversityMonitor, type DiversityMonitor } from "./diversity.js";
import { requisition, type Requisitioned } from "./requisition.js";
import type { HostSource } from "./host-source.js";

export interface DaemonDeps {
  /** The host's structural declaration, checked by the precondition gate. */
  readonly host: HostDeclaration;
  /** The live source the daemon requisitions (the Mode-B Other, tag D). */
  readonly source: HostSource;
  readonly layers: Layers;
  readonly glob: GlobMod;
  /** The host's bootstrap first emission for cycle-0 (P(a)). */
  readonly initialEmission: Emission;
  /**
   * In-memory [data] fixture, used ONLY when the host declares no substrate
   * (`host.store.root` absent — test / throwaway). With a substrate, DIL builds
   * the durable [data] itself at startup (requisition), never RAM.
   */
  readonly data?: DataStore;
  /** In-memory [event] fixture, used ONLY when the host declares no substrate. */
  readonly events?: EventLog;
  /** Optional diversity monitor; one is created if omitted. */
  readonly diversity?: DiversityMonitor;
  /**
   * Optional commit repo. With a substrate, requisition binds one under
   * store/commits/; without a substrate, pass one here or no commits fire.
   */
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
  /**
   * The startup requisition report (pre-existing host content admitted as
   * `prior` / rejected), or null when the daemon ran on an in-memory fixture
   * (no substrate) or has not started.
   */
  requisitionReport(): {
    readonly admitted: number;
    readonly rejected: readonly { readonly id: string; readonly reason: string }[];
  } | null;
  /**
   * Release the requisitioned substrate handles (the SQLite `[data]` store and
   * the `[event]` sink file). A no-op on the in-memory fixture path. Stops the
   * daemon; the durable log on disk is untouched (append-only, never rolled back).
   */
  close(): void;
}

export function createDaemon(deps: DaemonDeps): Daemon {
  const commitEvery = deps.commitEvery ?? COMMIT_EVERY;
  const diversity = deps.diversity ?? createDiversityMonitor();

  // Resolved at STARTUP (requisition), never before: DIL imposes its store law on
  // the host substrate when "the king sits", after the gate qualifies.
  let cycle: Cycle | null = null;
  let data: DataStore | undefined;
  let events: EventLog | undefined;
  let commits: CommitStore | undefined = deps.commits;
  let chainHead: (() => string) | undefined = deps.chainHead;
  let requisitioned: Requisitioned | null = null;

  let running = false;
  let last: CycleResult | null = null;
  let totalScars = 0;
  let scarsSinceCommit = 0;

  function writeMarker(extra: Partial<Pick<CommitMarker, "recoveredFrom" | "stateHash">> = {}): string {
    if (!cycle || !events || !data || !commits) {
      throw new Error("commit requires a started daemon with a commit store");
    }
    const stateHash =
      extra.stateHash ??
      commits.putState(takeSnapshot(deps.layers, deps.glob, cycle.snapshot(), data));
    const marker: CommitMarker = {
      // A fork marker branches FROM the restored point (git semantics: the new
      // line's parent is where you checked out, not the abandoned tip).
      parent: extra.recoveredFrom ?? commits.head(),
      ...(extra.recoveredFrom !== undefined ? { recoveredFrom: extra.recoveredFrom } : {}),
      chainHead: chainHead?.() ?? null,
      eventCount: events.size(),
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
    return commits.putMarker(marker);
  }

  function step(): boolean {
    if (!running || !cycle) return false;
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
      // Check before the king sits down (protocol §4).
      const gate = checkPrecondition(deps.host);
      if (gate.outcome !== "qualify") return gate;

      // The king sits: requisition the host's substrate and impose DIL's store
      // law. Without a declared substrate, fall back to the in-memory fixtures —
      // a test / throwaway host; RAM is never a real deployment's store.
      if (deps.host.store.root !== undefined) {
        requisitioned = requisition(deps.host);
        data = requisitioned.data;
        events = requisitioned.events;
        commits = requisitioned.commits;
        if (chainHead === undefined) chainHead = requisitioned.events.head;
      } else {
        if (!deps.data || !deps.events) {
          throw new Error(
            "daemon: host declares no substrate (store.root) and no in-memory data/events fixture was provided",
          );
        }
        data = deps.data;
        events = deps.events;
      }

      // Recovery (before the cycle runs): restore the full accrued state.
      let resume: DriverState | undefined;
      let recoveredFrom: { hash: string; marker: CommitMarker } | null = null;
      if (deps.recoverFrom !== undefined) {
        if (!commits) throw new Error("recoverFrom requires a commit store");
        const marker = commits.getMarker(deps.recoverFrom);
        const snap = commits.getState(marker.stateHash) as SystemSnapshot;
        resume = restoreSnapshot(snap, deps.layers, deps.glob, data);
        recoveredFrom = { hash: deps.recoverFrom, marker };
        totalScars = marker.scarCount;
      }

      cycle = createCycle({
        layers: deps.layers,
        glob: deps.glob,
        data,
        events,
        initialEmission: deps.initialEmission,
        resume,
      });
      running = true;

      // Recovery stamps the fork instantly: parent = the marker restored from.
      if (commits && recoveredFrom) {
        writeMarker({
          recoveredFrom: recoveredFrom.hash,
          stateHash: recoveredFrom.marker.stateHash,
        });
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
    cyclesRun: () => cycle?.cycleCount() ?? 0,
    diversitySignal: () => diversity.signal(),
    lastResult: () => last,
    commit: () => (running && commits ? writeMarker() : null),
    requisitionReport: () =>
      requisitioned
        ? { admitted: requisitioned.admitted, rejected: requisitioned.rejected }
        : null,
    close: () => {
      if (requisitioned) requisitioned.close();
      running = false;
    },
  };
}
