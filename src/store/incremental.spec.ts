import { createClient, type Client } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { createTursoClient, type AppRecord, type TursoDataset } from "./turso-client";

function app(id: string, overrides: Partial<AppRecord> = {}): AppRecord {
  return {
    id,
    name: `App ${id}`,
    shortDescription: `Does ${id} things`,
    category: "Utilities",
    iconUrl: `https://example.org/${id}.png`,
    popularity: 0.5,
    dataConfidence: { score: 0, signals: [] },
    packages: [{ source: "flathub", name: id }],
    ...overrides,
  };
}

const BEFORE: TursoDataset = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  apps: [
    app("a"),
    app("b", { category: "Games", contentType: "game", packages: [{ source: "gog", name: "b" }] }),
    app("c", { licenseKind: "free" }),
  ],
};

/** `BEFORE` with one app renamed, one rescored, one gone (the only game, the only GOG one) and one new. */
const AFTER: TursoDataset = {
  generatedAt: "2026-02-01T00:00:00.000Z",
  apps: [
    app("a", { name: "Renamed" }),
    app("c", { licenseKind: "free", popularity: 0.9 }),
    app("d", { category: "Graphics", packages: [{ source: "snap", name: "d" }] }),
  ],
};

function memoryDb(): Client {
  return createClient({ url: "file::memory:" });
}

/**
 * Everything `app` can read, comparable across two databases: rows by
 * id, search rows by id, and `meta` without this module's bookkeeping,
 * with the browse generation (which an incremental publish keeps) named
 * `GEN`.
 */
async function snapshot(db: Client) {
  // `Row`s carry their values by name and by position: compare plain copies.
  const apps = (await db.execute(`SELECT * FROM apps ORDER BY id`)).rows.map((row) =>
    Object.fromEntries(Object.entries(row)),
  );
  const search = (
    await db.execute(`SELECT id, name, short_description FROM apps_fts ORDER BY id`)
  ).rows.map((row) => Object.fromEntries(Object.entries(row)));
  const generation = JSON.parse(
    String((await db.execute(`SELECT value FROM meta WHERE key = 'browseKeys'`)).rows[0]?.value),
  ).generation as string;
  const meta = Object.fromEntries(
    (await db.execute(`SELECT key, value FROM meta ORDER BY key`)).rows
      .map((row) => [String(row.key), String(row.value)])
      .filter(
        ([key]) =>
          !key?.startsWith("rowHashes:") &&
          key !== "publishInProgress" &&
          key !== "ftsRowidsAligned",
      )
      .map(([key, value]) => [
        key?.replaceAll(generation, "GEN"),
        value?.replaceAll(generation, "GEN"),
      ]),
  );
  return { apps, search, meta };
}

/** Every search row sits at its app's rowid — what lets the incremental path update one by rowid. */
async function searchRowidsAligned(db: Client): Promise<boolean> {
  const result = await db.execute(
    `SELECT COUNT(*) AS n FROM apps_fts JOIN apps ON apps.rowid = apps_fts.rowid WHERE apps.id = apps_fts.id`,
  );
  const total = await db.execute(`SELECT COUNT(*) AS n FROM apps`);
  return result.rows[0]?.n === total.rows[0]?.n;
}

async function fullPublishOf(dataset: TursoDataset) {
  const db = memoryDb();
  await createTursoClient({ url: "file::memory:" }, db).publish(dataset);
  return snapshot(db);
}

describe("incremental publish", () => {
  it("leaves the store exactly as a full publish of the new dataset would, deletions included", async () => {
    const db = memoryDb();
    const client = createTursoClient({ url: "file::memory:" }, db);
    expect((await client.publish(BEFORE)).mode).toBe("full");

    const report = await client.publish(AFTER);

    expect(report).toMatchObject({
      mode: "incremental",
      inserted: 1,
      updated: 2,
      deleted: 1,
      unchanged: 0,
      // a renamed, b gone, d new; c's popularity isn't searchable
      searchRowsWritten: 3,
    });
    expect(await snapshot(db)).toEqual(await fullPublishOf(AFTER));
    expect(await searchRowidsAligned(db)).toBe(true);
  });

  it("deletes the keys counting what's gone: the only game, the only GOG app, a category", async () => {
    const db = memoryDb();
    const client = createTursoClient({ url: "file::memory:" }, db);
    await client.publish(BEFORE);
    await client.publish(AFTER);

    const keys = (await db.execute(`SELECT key FROM meta`)).rows.map((row) => String(row.key));
    expect(keys.filter((key) => key.includes(":gog:") || key.includes("Games"))).toEqual([]);
    expect(keys.some((key) => key.includes(":game:"))).toBe(false);
  });

  it("adds a new nullable column in place, writing only the rows that have a value for it", async () => {
    const db = memoryDb();
    const client = createTursoClient({ url: "file::memory:" }, db);
    await client.publish(BEFORE);
    // The store as an older version of this code left it: without the last two columns.
    await db.execute(`ALTER TABLE apps DROP COLUMN brand_colors_json`);
    await db.execute(`ALTER TABLE apps DROP COLUMN kudos_json`);

    const branded = {
      ...BEFORE,
      apps: BEFORE.apps.map((entry) =>
        entry.id === "a"
          ? { ...entry, brandColors: { light: "#bfdbfe", dark: "#1e3a8a" }, kudos: ["HiDpiIcon"] }
          : entry,
      ),
    };
    const report = await client.publish(branded);

    expect(report).toMatchObject({
      mode: "incremental",
      addedColumns: ["brand_colors_json", "kudos_json"],
      inserted: 0,
      updated: 1,
      deleted: 0,
      unchanged: 2,
    });
    expect(await snapshot(db)).toEqual(await fullPublishOf(branded));
  });

  it("falls back to a full publish for a missing required column", async () => {
    const db = memoryDb();
    const client = createTursoClient({ url: "file::memory:" }, db);
    await client.publish(BEFORE);
    await db.execute(`ALTER TABLE apps DROP COLUMN packages_json`);

    expect(await client.publish(AFTER)).toMatchObject({
      mode: "full",
      fullReason: expect.stringContaining("columns"),
    });
  });

  it("keeps meta.buildInfo current: written, replaced, and dropped when the dataset has none", async () => {
    const db = memoryDb();
    const client = createTursoClient({ url: "file::memory:" }, db);
    const read = async () =>
      (await db.execute(`SELECT value FROM meta WHERE key = 'buildInfo'`)).rows[0]?.value;
    const first = { catalog: { commit: "aaaaaaa", date: "2026-10-12T21:30:00.000Z" } };

    await client.publish({ ...BEFORE, buildInfo: first });
    expect(JSON.parse(String(await read()))).toEqual(first);

    const second = {
      ...first,
      sources: { oldest: "2026-10-10T04:00:00.000Z", newest: "2026-10-12T21:20:11.071Z" },
    };
    expect((await client.publish({ ...BEFORE, buildInfo: second })).mode).toBe("incremental");
    expect(JSON.parse(String(await read()))).toEqual(second);

    await client.publish(BEFORE);
    expect(await read()).toBeUndefined();
  });

  it("writes nothing for an unchanged dataset", async () => {
    const db = memoryDb();
    const client = createTursoClient({ url: "file::memory:" }, db);
    await client.publish(BEFORE);

    expect(await client.publish(BEFORE)).toMatchObject({
      mode: "incremental",
      inserted: 0,
      updated: 0,
      deleted: 0,
      unchanged: 3,
      searchRowsWritten: 0,
      metaWritten: 0,
      metaDeleted: 0,
    });
  });

  it("finds a renamed app by its new name, and no longer finds a deleted one", async () => {
    const db = memoryDb();
    const client = createTursoClient({ url: "file::memory:" }, db);
    await client.publish(BEFORE);
    await client.publish(AFTER);

    const search = async (text: string) =>
      (
        await db.execute({
          sql: `SELECT apps.id FROM apps_fts JOIN apps ON apps.rowid = apps_fts.rowid WHERE apps_fts MATCH ?`,
          args: [`"${text}"`],
        })
      ).rows.map((row) => row.id);
    expect(await search("Renamed")).toEqual(["a"]);
    expect(await search("Does b")).toEqual([]);
    expect(await search("Does d")).toEqual(["d"]);
  });

  it("compares every live row when the previous publish died half way, so its hashes aren't trusted", async () => {
    const db = memoryDb();
    const client = createTursoClient({ url: "file::memory:" }, db);
    await client.publish(BEFORE);
    // A publish that wrote a row and died before clearing its mark.
    await db.execute(`UPDATE apps SET popularity = 0.1 WHERE id = 'a'`);
    await db.execute(`INSERT INTO meta (key, value) VALUES ('publishInProgress', 'x')`);

    const report = await client.publish(BEFORE);

    expect(report).toMatchObject({ mode: "incremental", updated: 1, unchanged: 2 });
    expect(await snapshot(db)).toEqual(await fullPublishOf(BEFORE));
    expect(
      (await db.execute(`SELECT key FROM meta WHERE key = 'publishInProgress'`)).rows,
    ).toHaveLength(0);
  });

  it("brings a store published before row hashes existed up to date without a rebuild", async () => {
    const db = memoryDb();
    const client = createTursoClient({ url: "file::memory:" }, db);
    await client.publish(BEFORE);
    await db.execute(`DELETE FROM meta WHERE key LIKE 'rowHashes:%' OR key = 'ftsRowidsAligned'`);

    const report = await client.publish(AFTER);

    expect(report.mode).toBe("incremental");
    expect(await snapshot(db)).toEqual(await fullPublishOf(AFTER));
  });

  it("falls back to a full publish when the live schema isn't this code's", async () => {
    const db = memoryDb();
    const client = createTursoClient({ url: "file::memory:" }, db);
    await client.publish(BEFORE);
    await db.execute(`DROP INDEX idx_apps_name`);

    const report = await client.publish(AFTER);

    expect(report).toMatchObject({ mode: "full", fullReason: expect.stringContaining("indexes") });
    expect(await snapshot(db)).toEqual(await fullPublishOf(AFTER));
  });

  it("falls back to a full publish when the search rows aren't at their apps' rowids", async () => {
    const db = memoryDb();
    const client = createTursoClient({ url: "file::memory:" }, db);
    await client.publish(BEFORE);
    await db.execute(`DELETE FROM meta WHERE key = 'ftsRowidsAligned'`);
    await db.execute(`DELETE FROM apps_fts WHERE id = 'a'`);
    await db.execute(
      `INSERT INTO apps_fts (rowid, id, name, short_description) VALUES (999, 'a', 'App a', 'x')`,
    );

    const report = await client.publish(AFTER);

    expect(report).toMatchObject({ mode: "full", fullReason: expect.stringContaining("rowids") });
    expect(await searchRowidsAligned(db)).toBe(true);
  });

  it("rebuilds everything when asked to", async () => {
    const db = memoryDb();
    const client = createTursoClient({ url: "file::memory:" }, db);
    await client.publish(BEFORE);

    expect(await client.publish(AFTER, { full: true })).toMatchObject({ mode: "full" });
    expect(await snapshot(db)).toEqual(await fullPublishOf(AFTER));
  });
});
