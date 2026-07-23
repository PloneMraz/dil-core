/**
 * SQLite-backed [data] store (DECIDE@IMPL tag F — store representation).
 *
 * `[data]` is the mutable present — DIL's working memory, overwritten each cycle
 * (protocol §9). The durable representation DIL imposes on the host's substrate
 * is a SQLite table under `store/memory/`, using `node:sqlite` — SQLite built
 * into Node (synchronous, matching the DataStore interface; zero external
 * dependency, no native build). One row per key: the `TaggedDatum` serialized as
 * JSON. An upsert keeps each key's rowid stable, so `entries()` reads back in
 * insertion order.
 *
 * This is one concrete `DataStore` behind the interface; the in-memory Map
 * (`createDataStore`) stays a test fixture. RAM is never the store of record —
 * the store-of-record lives on the requisitioned substrate (CONTEXT §5).
 */

import { DatabaseSync } from "node:sqlite";
import type { TaggedDatum } from "./tags.js";
import type { DataStore } from "./data-store.js";

export interface SqliteDataStore extends DataStore {
  /** Close the underlying database handle. */
  close(): void;
}

/**
 * Open (or create) a SQLite `[data]` store at `dbPath`. Pass a file path under
 * `store/memory/` for a durable store, or `":memory:"` for an ephemeral test
 * store (still SQLite, no file on disk).
 */
export function createSqliteDataStore(dbPath: string): SqliteDataStore {
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE IF NOT EXISTS data (k TEXT PRIMARY KEY, v TEXT NOT NULL)");

  // Upsert preserves the row's rowid on update, so insertion order is stable.
  const putStmt = db.prepare(
    "INSERT INTO data(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
  );
  const getStmt = db.prepare("SELECT v FROM data WHERE k = ?");
  const hasStmt = db.prepare("SELECT 1 FROM data WHERE k = ?");
  const delStmt = db.prepare("DELETE FROM data WHERE k = ?");
  const clearStmt = db.prepare("DELETE FROM data");
  const sizeStmt = db.prepare("SELECT count(*) AS n FROM data");
  const allStmt = db.prepare("SELECT k, v FROM data ORDER BY rowid");

  return {
    put(id: string, datum: TaggedDatum): void {
      putStmt.run(id, JSON.stringify(datum));
    },
    get(id: string): TaggedDatum | undefined {
      const row = getStmt.get(id) as { v: string } | undefined;
      return row ? (JSON.parse(row.v) as TaggedDatum) : undefined;
    },
    has(id: string): boolean {
      return hasStmt.get(id) !== undefined;
    },
    delete(id: string): boolean {
      return Number(delStmt.run(id).changes) > 0;
    },
    clear(): void {
      clearStmt.run();
    },
    size(): number {
      return Number((sizeStmt.get() as { n: number | bigint }).n);
    },
    entries(): readonly (readonly [string, TaggedDatum])[] {
      const rows = allStmt.all() as { k: string; v: string }[];
      return rows.map((r) => [r.k, JSON.parse(r.v) as TaggedDatum] as const);
    },
    close(): void {
      db.close();
    },
  };
}
