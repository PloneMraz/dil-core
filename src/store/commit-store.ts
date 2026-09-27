/**
 * The commit repo (protocol §9) — git-style, at `store/commits/`.
 *
 * A COMMIT MARKER is the tiny commit-object: parent-linked (the DAG), it points
 * INTO the [event] log via the hash-chain head and at its snapshot payload via
 * a content address. The PAYLOAD is the whole-system state, stored as a tree of
 * content-addressed objects, as git stores a commit's tree (choice 2-(b); Plone,
 * 2026-09-27): every object or array in it whose JSON is at least
 * MIN_OBJECT_BYTES long is stored once, under `objects/`, by the sha256 of its
 * text, and stands in its parent as `{"#dil-ref": <hash>}`; the root is stored
 * under `state/`, and its hash is the snapshot's address. A subtree that did not
 * change since the last snapshot — a datum, a grid, a layer's state — is the
 * same object, stored once: a snapshot costs what changed, not the whole store.
 * Every object read is checked against its name, so the root's hash still
 * covers the whole state (a Merkle tree). Until 2026-09-27 each snapshot was
 * one JSON (choice 2-(a)), rewritten whole each time; such a state has no
 * reference in it and is read as it was.
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

/**
 * DECIDE@IMPL (declared, not measured): how large a subtree must be to be an
 * object of its own. Smaller ones stay inline in their parent; a row of a grid
 * does, a grid does not. A bound on the number of files, not on what is kept.
 */
export const MIN_OBJECT_BYTES = 1024;

/** The key of a reference to an object, and of an escaped value that has it. */
const REF = "#dil-ref";
const ESC = "#dil-esc";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function createDirCommitStore(dir: string): CommitStore {
  const stateDir = path.join(dir, "state");
  const objectDir = path.join(dir, "objects");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(objectDir, { recursive: true });
  const headFile = path.join(dir, "HEAD");

  /** A value whose large subtrees are stored and replaced by their references. */
  function children(value: Json): Json {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(store);
    const out: { [key: string]: Json } = {};
    for (const [k, v] of Object.entries(value)) out[k] = store(v);
    // A value that looks like a reference is escaped, so it reads back as itself.
    return REF in out || ESC in out ? { [ESC]: out } : out;
  }

  /** A value stored as an object of its own if it is large enough, else inline. */
  function store(value: Json): Json {
    if (value === null || typeof value !== "object") return value;
    const node = children(value);
    const text = JSON.stringify(node);
    if (text.length < MIN_OBJECT_BYTES) return node;
    const hash = sha256(text);
    putObject(path.join(objectDir, `${hash}.json`), text);
    return { [REF]: hash };
  }

  /** A value with every reference read back (and checked) and every escape undone. */
  function load(value: Json): Json {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(load);
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === REF && typeof value[REF] === "string") {
      const hash = value[REF] as string;
      return load(JSON.parse(getObject(path.join(objectDir, `${hash}.json`), hash, "object")) as Json);
    }
    if (keys.length === 1 && keys[0] === ESC) {
      const inner = value[ESC] as { [key: string]: Json };
      const out: { [key: string]: Json } = {};
      for (const [k, v] of Object.entries(inner)) out[k] = load(v);
      return out;
    }
    const out: { [key: string]: Json } = {};
    for (const [k, v] of Object.entries(value)) out[k] = load(v);
    return out;
  }

  return {
    putState(state: unknown): string {
      // Plain JSON first: what a snapshot is, not how it is held in memory.
      const plain = JSON.parse(JSON.stringify(state)) as Json;
      const text = JSON.stringify(children(plain));
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
      return load(JSON.parse(
        getObject(path.join(stateDir, `${stateHash}.json`), stateHash, "state payload"),
      ) as Json);
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
