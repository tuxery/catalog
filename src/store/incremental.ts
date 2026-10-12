import { createHash } from "node:crypto";
import { chunk } from "helpers4/array";
import type { Client, InStatement, Row } from "@libsql/client";

// Incremental publish: write only what changed since the live dataset,
// instead of rebuilding `apps`, its search index and its 15 indexes from
// scratch. A full publish costs ~17 rows written per app (one per table or
// index b-tree it lands in) — ~1.7M for 100k apps, against a 10M
// rows-written monthly quota shared by preview and prod (tuxery/catalog#52).
// Here an unchanged app costs nothing, a changed one one `UPDATE` of just
// the columns that differ (so only the indexes over those columns move),
// and an app gone from the dataset is deleted, with its search row and every
// precomputed `meta` key that no longer exists.
//
// Bookkeeping lives in `meta`, never in `apps` (whose columns `app` reads):
// - `rowHashes:<bucket>`: each live app's row hash, in `HASH_BUCKETS` rows.
//   Only a filter: a mismatch makes this compare the live row column by
//   column, so a stale hash costs reads, never a wrong write.
// - `publishInProgress`: set before the first write, cleared after the
//   last. Found at the start of a publish, it means the previous one died
//   half way, so the hashes may not describe the live rows: every live row
//   is compared instead (~1 row read per app, the read quota is 50x the
//   write one).
// - `ftsRowidsAligned`: the search index's rowids are `apps`' own, so one
//   app's search row is found by rowid (see turso-client.ts' APPS_FTS_SQL).

/** Prefix of the `meta` rows holding the row hashes. */
const ROW_HASHES_PREFIX = "rowHashes:";
const HASH_BUCKETS = 64;
const PUBLISH_IN_PROGRESS_KEY = "publishInProgress";
const FTS_ROWIDS_ALIGNED_KEY = "ftsRowidsAligned";

/** `meta` keys only this module writes: never part of a dataset's own `meta`, never deleted as stale. */
function isBookkeepingKey(key: string): boolean {
  return (
    key.startsWith(ROW_HASHES_PREFIX) ||
    key === PUBLISH_IN_PROGRESS_KEY ||
    key === FTS_ROWIDS_ALIGNED_KEY
  );
}

/** Statements per `db.batch()` round trip, like the full publish's inserts. */
const WRITE_BATCH_SIZE = 500;
/** Ids per `WHERE id IN (...)` read, and rows per page of a full compare. */
const READ_BATCH_SIZE = 200;

// Bulk meta rows go out as multi-row upserts capped by entry count and
// payload size: the 572 id chunks alone are ~6 MB, well past the ~1 MB
// request the 500-row `apps` batches already send, and Turso's request
// limit isn't documented.
const META_UPSERT_MAX_ENTRIES = 200;
const META_UPSERT_MAX_BYTES = 750_000;

export async function upsertMetaInBatches(
  db: Client,
  entries: Array<[string, string]>,
): Promise<void> {
  let pending: Array<[string, string]> = [];
  let bytes = 0;
  const flush = async (): Promise<void> => {
    if (pending.length === 0) return;
    await db.execute({
      sql: `INSERT INTO meta (key, value) VALUES ${pending.map(() => "(?, ?)").join(", ")}
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      args: pending.flat(),
    });
    pending = [];
    bytes = 0;
  };
  for (const entry of entries) {
    const size = entry[0].length + entry[1].length;
    if (pending.length >= META_UPSERT_MAX_ENTRIES || bytes + size > META_UPSERT_MAX_BYTES) {
      // eslint-disable-next-line no-await-in-loop
      await flush();
    }
    pending.push(entry);
    bytes += size;
  }
  await flush();
}

/**
 * Deletes every `meta` row a dataset no longer produces — a count that
 * fell to zero, a category or source gone, a shorter id chunk list, a
 * previous generation — but this module's own bookkeeping. `app` reads a
 * missing count as 0, a stale one as a wrong answer. Returns how many.
 */
export async function deleteStaleMeta(
  db: Client,
  wantedKeys: ReadonlySet<string>,
  liveKeys?: Iterable<string>,
): Promise<number> {
  const keys =
    liveKeys ?? (await db.execute(`SELECT key FROM meta`)).rows.map((row) => String(row.key));
  const stale = [...keys].filter((key) => !wantedKeys.has(key) && !isBookkeepingKey(key));
  for (const part of chunk(stale, WRITE_BATCH_SIZE)) {
    // eslint-disable-next-line no-await-in-loop
    await db.execute({
      sql: `DELETE FROM meta WHERE key IN (${part.map(() => "?").join(", ")})`,
      args: part,
    });
  }
  return stale.length;
}

/** What a publish did — printed by `pnpm seed`, and what tests check. */
export interface PublishReport {
  mode: "full" | "incremental";
  /** Why a publish that could have been incremental was full. */
  fullReason?: string;
  inserted: number;
  updated: number;
  deleted: number;
  unchanged: number;
  /** Search rows rewritten (an app's name or short description changed, or it came or went). */
  searchRowsWritten: number;
  metaWritten: number;
  metaDeleted: number;
}

function sha1(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

function rowHash(row: readonly unknown[]): string {
  return sha1(JSON.stringify(row)).slice(0, 16);
}

function bucketOf(id: string): number {
  return Number.parseInt(sha1(id).slice(0, 4), 16) % HASH_BUCKETS;
}

function rowHashesKey(bucket: number): string {
  return `${ROW_HASHES_PREFIX}${String(bucket).padStart(2, "0")}`;
}

/** Marks a publish as started: until `endPublish`, the row hashes aren't trusted. */
export async function beginPublish(db: Client): Promise<void> {
  await db.execute(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  await db.execute({
    sql: `INSERT INTO meta (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [PUBLISH_IN_PROGRESS_KEY, new Date().toISOString()],
  });
}

/**
 * Records the live rows' hashes (every bucket, or only `buckets`) and
 * clears the in-progress mark. Last step of both publish modes: only a
 * publish that got this far leaves hashes the next one trusts.
 */
export async function endPublish(
  db: Client,
  rows: ReadonlyMap<string, readonly unknown[]>,
  buckets?: ReadonlySet<number>,
): Promise<void> {
  const hashes = Array.from({ length: HASH_BUCKETS }, () => ({}) as Record<string, string>);
  for (const [id, row] of rows) {
    const bucket = hashes[bucketOf(id)];
    if (bucket) bucket[id] = rowHash(row);
  }
  await upsertMetaInBatches(
    db,
    hashes.flatMap((bucket, index): Array<[string, string]> =>
      buckets === undefined || buckets.has(index)
        ? [[rowHashesKey(index), JSON.stringify(bucket)]]
        : [],
    ),
  );
  await db.batch(
    [
      {
        sql: `INSERT INTO meta (key, value) VALUES (?, '1')
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        args: [FTS_ROWIDS_ALIGNED_KEY],
      },
      { sql: `DELETE FROM meta WHERE key = ?`, args: [PUBLISH_IN_PROGRESS_KEY] },
    ],
    "write",
  );
}

/** The live store, when an incremental publish can run on it. */
export type LiveStore =
  | { ok: true; generation: string | undefined; trustHashes: boolean }
  | { ok: false; reason: string };

function normalizeSql(sql: string): string {
  return sql.replaceAll(/\s+/g, " ").trim().toLowerCase();
}

async function metaValue(db: Client, key: string): Promise<string | undefined> {
  const result = await db.execute({ sql: `SELECT value FROM meta WHERE key = ?`, args: [key] });
  const value = result.rows[0]?.value;
  return typeof value === "string" ? value : undefined;
}

/**
 * Whether the live database has exactly the tables, columns and indexes
 * this code would build — anything else (a first publish, a column added
 * since, an index dropped by hand) needs a full publish, which rebuilds
 * the schema. Reads `sqlite_master` and a handful of `meta` rows; checking
 * the search index's rowids the first time costs one read per app.
 */
export async function inspectLiveStore(
  db: Client,
  columns: readonly string[],
  indexesSql: readonly string[],
): Promise<LiveStore> {
  const tables = await db.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('apps', 'apps_fts', 'meta')`,
  );
  const tableNames = new Set(tables.rows.map((row) => row.name));
  for (const table of ["apps", "apps_fts", "meta"]) {
    if (!tableNames.has(table)) return { ok: false, reason: `no ${table} table` };
  }

  const info = await db.execute(`PRAGMA table_info(apps)`);
  const live = info.rows.map((row) => String(row.name)).toSorted();
  const expected = [...columns].toSorted();
  if (live.join(",") !== expected.join(",")) {
    return { ok: false, reason: "the apps columns differ from this code's" };
  }

  const indexes = await db.execute(
    `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'apps' AND sql IS NOT NULL`,
  );
  const liveIndexes = indexes.rows.map((row) => normalizeSql(String(row.sql))).toSorted();
  const expectedIndexes = indexesSql.map(normalizeSql).toSorted();
  if (liveIndexes.join(";") !== expectedIndexes.join(";")) {
    return { ok: false, reason: "the apps indexes differ from this code's" };
  }

  if ((await metaValue(db, FTS_ROWIDS_ALIGNED_KEY)) === undefined) {
    // A store published before this module: its search index was filled
    // from `apps_next` in rowid order, so its rowids should already match.
    // Checked once, then recorded by `endPublish`.
    const check = await db.execute(
      `SELECT
         (SELECT COUNT(*) FROM apps) AS apps,
         (SELECT COUNT(*) FROM apps_fts) AS fts,
         (SELECT COUNT(*) FROM apps_fts JOIN apps ON apps.rowid = apps_fts.rowid
           WHERE apps.id = apps_fts.id) AS aligned`,
    );
    const row = check.rows[0];
    if (!row || row.apps !== row.fts || row.apps !== row.aligned) {
      return { ok: false, reason: "the search index's rowids don't match apps'" };
    }
  }

  const browseKeys = await metaValue(db, "browseKeys");
  const generation = browseKeys
    ? (JSON.parse(browseKeys) as { generation?: unknown }).generation
    : undefined;
  const inProgress = await metaValue(db, PUBLISH_IN_PROGRESS_KEY);
  return {
    ok: true,
    generation: typeof generation === "string" ? generation : undefined,
    trustHashes: inProgress === undefined,
  };
}

export interface IncrementalInput {
  /** `apps`' columns, `id` first — the order of every row below. */
  columns: readonly string[];
  /** Every app of the new dataset: id to its row. */
  rows: ReadonlyMap<string, readonly unknown[]>;
  /** Every `meta` row the new dataset should leave, built on the live generation. */
  meta: ReadonlyArray<[string, string]>;
}

/** Same value as SQLite returns it: `undefined` is stored as NULL, numbers come back as numbers. */
function sameValue(live: unknown, wanted: unknown): boolean {
  return (live ?? null) === (wanted ?? null);
}

/**
 * Brings the live store to `input` with the fewest writes: see the
 * comment at the top of this file. Writes go out in this order — app
 * rows, search rows, `meta`, then the hashes — so `app` never reads a
 * precomputed listing naming an app that isn't there yet.
 */
export async function publishIncremental(
  db: Client,
  input: IncrementalInput,
  live: Extract<LiveStore, { ok: true }>,
): Promise<PublishReport> {
  const { columns, rows } = input;
  const nameIndex = columns.indexOf("name");
  const descriptionIndex = columns.indexOf("short_description");
  const report: PublishReport = {
    mode: "incremental",
    inserted: 0,
    updated: 0,
    deleted: 0,
    unchanged: 0,
    searchRowsWritten: 0,
    metaWritten: 0,
    metaDeleted: 0,
  };

  // Read the hashes before marking this publish as started.
  const liveHashes = new Map<string, string>();
  if (live.trustHashes) {
    // A key range, not LIKE: it seeks the primary key instead of scanning `meta`.
    const result = await db.execute({
      sql: `SELECT value FROM meta WHERE key >= ? AND key < ?`,
      args: [ROW_HASHES_PREFIX, `${ROW_HASHES_PREFIX}\uffff`],
    });
    for (const row of result.rows) {
      for (const [id, hash] of Object.entries(JSON.parse(String(row.value)) as object)) {
        liveHashes.set(id, String(hash));
      }
    }
  }
  // No hashes at all: a store published before this module, compared in full.
  const trustHashes = live.trustHashes && liveHashes.size > 0;

  await beginPublish(db);

  const statements: InStatement[] = [];
  const touchedBuckets = new Set<number>();
  const liveIds = new Set<string>();

  /** Queues the writes turning `liveRow` into `wanted`, if any differ. */
  const diff = (liveRow: Row, wanted: readonly unknown[]): void => {
    const id = String(liveRow.id);
    const changed = columns
      .map((column, index) => [column, wanted[index]] as const)
      .filter(([column, value]) => !sameValue(liveRow[column], value));
    if (changed.length === 0) {
      report.unchanged += 1;
      return;
    }
    report.updated += 1;
    touchedBuckets.add(bucketOf(id));
    statements.push({
      sql: `UPDATE apps SET ${changed.map(([column]) => `${column} = ?`).join(", ")} WHERE id = ?`,
      args: [...changed.map(([, value]) => value), id] as never[],
    });
    if (changed.some(([column]) => column === "name" || column === "short_description")) {
      report.searchRowsWritten += 1;
      statements.push({
        sql: `UPDATE apps_fts SET name = ?, short_description = ? WHERE rowid = ?`,
        args: [wanted[nameIndex], wanted[descriptionIndex], liveRow.row_id] as never[],
      });
    }
  };

  const select = `SELECT rowid AS row_id, ${columns.join(", ")} FROM apps`;
  if (trustHashes) {
    for (const id of liveHashes.keys()) liveIds.add(id);
    const suspects = [...rows].filter(
      ([id, row]) => liveHashes.has(id) && liveHashes.get(id) !== rowHash(row),
    );
    report.unchanged += liveIds.size - suspects.length;
    for (const part of chunk(suspects, READ_BATCH_SIZE)) {
      // eslint-disable-next-line no-await-in-loop
      const result = await db.execute({
        sql: `${select} WHERE id IN (${part.map(() => "?").join(", ")})`,
        args: part.map(([id]) => id),
      });
      for (const liveRow of result.rows) {
        const wanted = rows.get(String(liveRow.id));
        if (wanted) diff(liveRow, wanted);
      }
    }
    // Hashes that matched were counted unchanged, but a hash for an app the
    // dataset dropped isn't a match: those are deletions, counted below.
    report.unchanged -= [...liveIds].filter((id) => !rows.has(id)).length;
  } else {
    // Every live row, by id pages (primary key order, so each page is a
    // seek, not a scan).
    let after = "";
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const page = await db.execute({
        sql: `${select} WHERE id > ? ORDER BY id LIMIT ${READ_BATCH_SIZE}`,
        args: [after],
      });
      for (const liveRow of page.rows) {
        const id = String(liveRow.id);
        liveIds.add(id);
        const wanted = rows.get(id);
        if (wanted) diff(liveRow, wanted);
      }
      const last = page.rows.at(-1);
      if (!last || page.rows.length < READ_BATCH_SIZE) break;
      after = String(last.id);
    }
  }

  for (const id of liveIds) {
    if (rows.has(id)) continue;
    report.deleted += 1;
    report.searchRowsWritten += 1;
    touchedBuckets.add(bucketOf(id));
    statements.push(
      {
        sql: `DELETE FROM apps_fts WHERE rowid = (SELECT rowid FROM apps WHERE id = ?)`,
        args: [id],
      },
      { sql: `DELETE FROM apps WHERE id = ?`, args: [id] },
    );
  }

  for (const [id, row] of rows) {
    if (liveIds.has(id)) continue;
    report.inserted += 1;
    report.searchRowsWritten += 1;
    touchedBuckets.add(bucketOf(id));
    statements.push(
      {
        sql: `INSERT INTO apps (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        args: row as never[],
      },
      {
        sql: `INSERT INTO apps_fts (rowid, id, name, short_description)
              SELECT rowid, id, name, short_description FROM apps WHERE id = ?`,
        args: [id],
      },
    );
  }

  for (const part of chunk(statements, WRITE_BATCH_SIZE)) {
    // eslint-disable-next-line no-await-in-loop
    await db.batch(part, "write");
  }

  // `meta`: rewrite what changed, delete what the new dataset no longer
  // produces.
  const liveMeta = await db.execute({
    sql: `SELECT key, value FROM meta WHERE key NOT LIKE ?`,
    args: [`${ROW_HASHES_PREFIX}%`],
  });
  const liveValues = new Map(liveMeta.rows.map((row) => [String(row.key), String(row.value)]));
  const toWrite = input.meta.filter(([key, value]) => liveValues.get(key) !== value);
  await upsertMetaInBatches(db, toWrite);
  report.metaWritten = toWrite.length;
  report.metaDeleted = await deleteStaleMeta(
    db,
    new Set(input.meta.map(([key]) => key)),
    liveValues.keys(),
  );

  // A full compare rewrites every bucket: the old ones can't be trusted.
  await endPublish(db, rows, trustHashes ? touchedBuckets : undefined);
  return report;
}
