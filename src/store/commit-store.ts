/**
 * The commit repo (protocol §9) — git-style, at `store/commits/`.
 *
 * A COMMIT MARKER is the tiny commit-object: parent-linked (the DAG), it points
 * INTO the [event] log via the hash-chain head and at its snapshot payload via
 * a content address. The PAYLOAD is the whole-system state (choice 2-(a):
 * one content-addressed JSON per snapshot, under `state/`).
 *
 * Immutability is self-enforcing, like git objects: every file's NAME is the
 * sha256 of its content — written once with the `wx` flag (fail-if-exists;
 * identical content is deduplicated by construction), never rewritten; editing
 * a file breaks its own name. `HEAD` is the one movable pointer (a git ref):
 * rollback moves it by writing a NEW fork marker — no marker is ever deleted.
 * Payload retention (SNAPSHOTS_RETAINED / MIN_SNAPSHOTS_RETAINED) governs
 * `state/` files only and is a deployment concern; no pruning exists here.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

/** The tiny commit object. All content beyond it lives behind hashes. */
export interface CommitMarker {
  /** Hash of the previous marker; null for the first commit. */
  readonly parent: string | null;
  /** Set on the fork marker written at recovery: the marker restored FROM. */
  readonly recoveredFrom?: string;
  /** The [event] hash-chain head at commit time (null when no durable sink). */
  readonly chainHead: string | null;
  /** Log volume at commit time. */
  readonly eventCount: number;
  /** Scars digested so far (the §9 counter rhythm, COMMIT_EVERY). */
  readonly scarCount: number;
  /** The cycle the snapshot was taken at (a cycle boundary). */
  readonly cycle: number;
  /** Wall-clock stamp, informational for operators (the loop runs in cycle-time). */
  readonly at: number;
  /** Content address of the snapshot payload. */
  readonly stateHash: string;
  /** The declared decision values in force (loop configuration, §9). */
  readonly config: Readonly<Record<string, unknown>>;
}

export interface CommitStore {
  /** Store a snapshot payload; returns its content address (idempotent). */
  putState(state: unknown): string;
  /** Store a marker; returns its content address and moves HEAD to it. */
  putMarker(marker: CommitMarker): string;
  /** Read a marker; throws if the content does not match its address. */
  getMarker(hash: string): CommitMarker;
  /** Read a snapshot payload; throws if the content does not match its address. */
  getState(stateHash: string): unknown;
  /** The movable pointer to the current branch tip, or null before any commit. */
  head(): string | null;
  /** All marker hashes present (unordered; order lives in the parent links). */
  list(): string[];
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Write-once, content-addressed put. Identical content deduplicates. */
function putObject(file: string, text: string): void {
  try {
    fs.writeFileSync(file, text, { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    // same address ⇒ same content: already stored, nothing to do
  }
}

/** Read + verify a content-addressed object (tampering breaks its own name). */
function getObject(file: string, expectedHash: string, kind: string): string {
  const text = fs.readFileSync(file, "utf8");
  if (sha256(text) !== expectedHash) {
    throw new Error(
      `commit store: ${kind} ${expectedHash} fails its content address — the file was altered`,
    );
  }
  return text;
}

export function createDirCommitStore(dir: string): CommitStore {
  const stateDir = path.join(dir, "state");
  fs.mkdirSync(stateDir, { recursive: true });
  const headFile = path.join(dir, "HEAD");

  return {
    putState(state: unknown): string {
      const text = JSON.stringify(state);
      const hash = sha256(text);
      putObject(path.join(stateDir, `${hash}.json`), text);
      return hash;
    },
    putMarker(marker: CommitMarker): string {
      const text = JSON.stringify(marker);
      const hash = sha256(text);
      putObject(path.join(dir, `${hash}.json`), text);
      fs.writeFileSync(headFile, hash); // the one movable pointer (a git ref)
      return hash;
    },
    getMarker(hash: string): CommitMarker {
      return JSON.parse(
        getObject(path.join(dir, `${hash}.json`), hash, "marker"),
      ) as CommitMarker;
    },
    getState(stateHash: string): unknown {
      return JSON.parse(
        getObject(path.join(stateDir, `${stateHash}.json`), stateHash, "state payload"),
      );
    },
    head(): string | null {
      return fs.existsSync(headFile) ? fs.readFileSync(headFile, "utf8").trim() : null;
    },
    list(): string[] {
      return fs
        .readdirSync(dir)
        .filter((name) => /^[0-9a-f]{64}\.json$/.test(name))
        .map((name) => name.slice(0, -5));
    },
  };
}
