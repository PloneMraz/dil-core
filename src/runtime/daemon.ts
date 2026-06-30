/**
 * The daemon — run the loop continuously (CONTEXT.md §4; stage 5).
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
 */

import { checkPrecondition, type GateResult } from "../precondition/gate.js";
import type { HostDeclaration } from "../host/declaration.js";
import { createCycle, type CycleDeps, type CycleResult } from "../loop/cycle.js";
import { createDiversityMonitor, type DiversityMonitor } from "./diversity.js";
import type { HostSource } from "./host-source.js";

export interface DaemonDeps extends CycleDeps {
  /** The host's structural declaration, checked by the precondition gate. */
  readonly host: HostDeclaration;
  /** The live source the daemon requisitions (the Mode-B Other, tag D). */
  readonly source: HostSource;
  /** Optional diversity monitor; one is created if omitted. */
  readonly diversity?: DiversityMonitor;
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
}

export function createDaemon(deps: DaemonDeps): Daemon {
  const cycle = createCycle(deps);
  const diversity = deps.diversity ?? createDiversityMonitor();
  let running = false;
  let last: CycleResult | null = null;

  function step(): boolean {
    if (!running) return false;
    const input = deps.source.next();
    if (input === null) return false;
    const result = cycle.run(input);
    deps.source.deliver(result.response);
    diversity.observe(result.collisionSources);
    last = result;
    return true;
  }

  return {
    start(): GateResult {
      const gate = checkPrecondition(deps.host);
      // Pass all → the king sits, the loop starts. Fail any → clean non-start.
      if (gate.outcome === "qualify") running = true;
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
  };
}
