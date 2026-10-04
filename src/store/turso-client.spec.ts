import { createClient, type Client } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import { createTursoClient, type AppRecord } from "./turso-client";

const APP: AppRecord = {
  id: "flathub:org.videolan.VLC",
  name: "VLC",
  shortDescription: "Media player",
  dataConfidence: { score: 0, signals: [] },
  packages: [{ source: "flathub", name: "VLC" }],
};

/** Reads one value out of the flat `[key1, value1, key2, value2, ...]` args array `INSERT INTO meta` is called with, by key rather than position. */
function metaValue(args: unknown[], key: string): string | undefined {
  const index = args.indexOf(key);
  return index === -1 ? undefined : (args[index + 1] as string);
}

/** The SQL text of an `execute()` argument, which is a plain string or a `{ sql, args }` statement (bulk meta upserts need args). */
function sqlOf(statement: unknown): string {
  return typeof statement === "string" ? statement : (statement as { sql: string }).sql;
}

function fakeClient(tableExists: boolean) {
  const execute = vi.fn<Client["execute"]>().mockResolvedValue({
    rows: tableExists ? [{ name: "apps" }] : [],
  } as never);
  const batch = vi.fn<Client["batch"]>().mockResolvedValue([] as never);
  return { execute, batch, client: { execute, batch } as unknown as Client };
}

describe("createTursoClient", () => {
  it("creates apps_next, batch-inserts rows, then swaps it in as apps", async () => {
    const { execute, batch, client } = fakeClient(false);
    const tursoClient = createTursoClient({ url: "file::memory:" }, client);

    await tursoClient.publish({ generatedAt: "2026-01-01T00:00:00.000Z", apps: [APP] });

    expect(execute).toHaveBeenCalledWith(expect.stringContaining("DROP TABLE IF EXISTS apps_next"));
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("CREATE TABLE apps_next"));

    // One batch for the row insert, one batch for the swap + meta write
    expect(batch).toHaveBeenCalledTimes(2);

    const insertBatch = batch.mock.calls[0]?.[0] as { sql: string; args: unknown[] }[];
    expect(insertBatch).toHaveLength(1);
    expect(insertBatch[0]?.sql).toContain("INSERT INTO apps_next");
    expect(insertBatch[0]?.args).toContain("flathub:org.videolan.VLC");
    expect(insertBatch[0]?.args).toContain(JSON.stringify(APP.packages));

    const swapBatch = batch.mock.calls[1]?.[0] as { sql: string }[];
    // First run: no existing `apps` table, so no rename-to-old step
    expect(swapBatch.map((s) => s.sql)).not.toContain("ALTER TABLE apps RENAME TO apps_old");
    expect(swapBatch.some((s) => s.sql.includes("ALTER TABLE apps_next RENAME TO apps"))).toBe(
      true,
    );
    expect(swapBatch.some((s) => s.sql.includes("INSERT INTO meta"))).toBe(true);
  });

  it("builds every filter/sort index on apps, after the rename swap has already dropped the old table", async () => {
    const { execute, batch, client } = fakeClient(false);
    const tursoClient = createTursoClient({ url: "file::memory:" }, client);

    await tursoClient.publish({ generatedAt: "2026-01-01T00:00:00.000Z", apps: [APP] });

    const executedSql = execute.mock.calls.map((call) => sqlOf(call[0]));
    for (const column of [
      "category",
      "content_type",
      "popularity",
      "last_updated",
      "installs_last_7_days",
      "name",
      "kind",
    ]) {
      expect(
        executedSql.some((sql) => sql.includes(`CREATE INDEX`) && sql.includes(`(${column})`)),
      ).toBe(true);
    }
    for (const composite of [
      "(content_type, category)",
      "(content_type, popularity)",
      "(content_type, last_updated)",
      "(content_type, installs_last_7_days)",
      "(category, popularity)",
    ]) {
      expect(
        executedSql.some((sql) => sql.includes("CREATE INDEX") && sql.includes(composite)),
      ).toBe(true);
    }

    // Every index statement targets the final `apps` table (never
    // `apps_next`) — building them on apps_next before the swap would
    // collide with a previous run's same-named indexes still attached to
    // the live `apps` table, since SQLite index names are global to the
    // database, not scoped per table (real failure, found live
    // 2026-09-03: CI's second publish to preview hit exactly this).
    const indexStatements = executedSql.filter((sql) => sql.includes("CREATE INDEX"));
    expect(indexStatements.length).toBeGreaterThan(0);
    expect(indexStatements.every((sql) => /\bON apps\(/.test(sql))).toBe(true);
    expect(indexStatements.every((sql) => !sql.includes("apps_next"))).toBe(true);

    // And they run strictly after the batch that does the rename swap +
    // apps_old drop — using vitest's cross-mock invocationCallOrder
    // since execute/batch are separate mock functions with independent
    // call arrays.
    const swapBatchOrder = batch.mock.invocationCallOrder[1];
    const firstIndexOrder =
      execute.mock.invocationCallOrder[executedSql.indexOf(indexStatements[0] ?? "")];
    expect(firstIndexOrder).toBeGreaterThan(swapBatchOrder ?? 0);
  });

  it("retries an 'already exists' index failure once (transient Turso consistency lag) and succeeds", async () => {
    vi.useFakeTimers();
    try {
      const { batch } = fakeClient(false);
      let failedOnce = false;
      const execute = vi.fn<Client["execute"]>().mockImplementation(async (sql) => {
        const text = sqlOf(sql);
        if (text.includes("CREATE INDEX idx_apps_category ON") && !failedOnce) {
          failedOnce = true;
          throw new Error("SQLite error: index idx_apps_category already exists");
        }
        return { rows: [] } as never;
      });
      const tursoClient = createTursoClient({ url: "file::memory:" }, {
        execute,
        batch,
      } as unknown as Client);

      const publishPromise = tursoClient.publish({
        generatedAt: "2026-01-01T00:00:00.000Z",
        apps: [APP],
      });
      await vi.runAllTimersAsync();
      await publishPromise;

      const categoryIndexCalls = execute.mock.calls.filter((call) =>
        sqlOf(call[0]).includes("CREATE INDEX idx_apps_category ON"),
      );
      // First attempt fails, retry succeeds — publish() doesn't throw.
      expect(categoryIndexCalls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up and rethrows after repeated 'already exists' failures, rather than silently skipping the index", async () => {
    // Real timers here (not fake, per the test above) — the retry
    // backoff is short (<=1s total across 3 attempts) and mixing fake
    // timers with an `expect(...).rejects` assertion that must resolve
    // before the timers advance runs into oxlint's valid-expect rule
    // (the assertion can't be split into a stored promise and awaited
    // later just to interleave `vi.runAllTimersAsync()`).
    const { batch } = fakeClient(false);
    const execute = vi.fn<Client["execute"]>().mockImplementation(async (sql) => {
      const text = sqlOf(sql);
      if (text.includes("CREATE INDEX idx_apps_category ON")) {
        throw new Error("SQLite error: index idx_apps_category already exists");
      }
      return { rows: [] } as never;
    });
    const tursoClient = createTursoClient({ url: "file::memory:" }, {
      execute,
      batch,
    } as unknown as Client);

    await expect(
      tursoClient.publish({ generatedAt: "2026-01-01T00:00:00.000Z", apps: [APP] }),
    ).rejects.toThrow("already exists");
  }, 5000);

  it("precomputes per-category counts (all/game/app) into meta instead of leaving them for a live COUNT(*) query", async () => {
    const { batch, client } = fakeClient(false);
    const tursoClient = createTursoClient({ url: "file::memory:" }, client);

    const apps: AppRecord[] = [
      { ...APP, id: "a", category: "Graphics & Design" },
      { ...APP, id: "b", category: "Graphics & Design" },
      { ...APP, id: "c", category: "Strategy", contentType: "game" },
      { ...APP, id: "d", category: "Action", contentType: "game" },
      { ...APP, id: "e", category: "Action", contentType: "game" },
    ];

    await tursoClient.publish({ generatedAt: "2026-01-01T00:00:00.000Z", apps });

    const swapBatch = batch.mock.calls[1]?.[0] as { sql: string; args?: unknown[] }[];
    const metaInsert = swapBatch.find((s) => s.sql.includes("INSERT INTO meta"));
    const args = metaInsert?.args as unknown[];

    expect(JSON.parse(metaValue(args, "categoryCounts:all") ?? "")).toEqual([
      { category: "Graphics & Design", count: 2 },
      { category: "Action", count: 2 },
      { category: "Strategy", count: 1 },
    ]);
    expect(JSON.parse(metaValue(args, "categoryCounts:game") ?? "")).toEqual([
      { category: "Action", count: 2 },
      { category: "Strategy", count: 1 },
    ]);
    expect(JSON.parse(metaValue(args, "categoryCounts:app") ?? "")).toEqual([
      { category: "Graphics & Design", count: 2 },
    ]);
  });

  it("precomputes trending/new/download-trending app-id lists per typeFilter, ranked and capped correctly", async () => {
    const { batch, client } = fakeClient(false);
    const tursoClient = createTursoClient({ url: "file::memory:" }, client);

    const apps: AppRecord[] = [
      {
        ...APP,
        id: "low",
        iconUrl: "icon.png",
        popularity: 0.2,
        lastUpdated: "2026-01-01",
        installsLast7Days: 10,
      },
      {
        ...APP,
        id: "high",
        iconUrl: "icon.png",
        popularity: 0.9,
        lastUpdated: "2026-03-01",
        installsLast7Days: 90,
      },
      // No icon — excluded from every listing (HAS_VISUAL_ASSET gate), even though it out-ranks "high" on every metric.
      {
        ...APP,
        id: "no-icon",
        popularity: 0.99,
        lastUpdated: "2026-04-01",
        installsLast7Days: 999,
      },
      // A game — only shows up under typeFilter "all"/"game", never "app".
      { ...APP, id: "game", iconUrl: "icon.png", popularity: 0.5, contentType: "game" },
    ];

    await tursoClient.publish({ generatedAt: "2026-01-01T00:00:00.000Z", apps });

    const swapBatch = batch.mock.calls[1]?.[0] as { sql: string; args?: unknown[] }[];
    const args = swapBatch.find((s) => s.sql.includes("INSERT INTO meta"))?.args as unknown[];
    const idsFor = (key: string) => JSON.parse(metaValue(args, key) ?? "[]") as string[];

    expect(idsFor("trending:all")).toEqual(["high", "game", "low"]);
    expect(idsFor("trending:app")).toEqual(["high", "low"]);
    expect(idsFor("trending:game")).toEqual(["game"]);
    expect(idsFor("newApps:all")).toEqual(["high", "low"]);
    expect(idsFor("downloadTrending:all")).toEqual(["high", "low"]);
  });

  it("precomputes a category preview (unscored apps last) and per-source trending app-id lists", async () => {
    const { batch, client } = fakeClient(false);
    const tursoClient = createTursoClient({ url: "file::memory:" }, client);

    const apps: AppRecord[] = [
      {
        ...APP,
        id: "scored",
        category: "Utilities",
        iconUrl: "icon.png",
        popularity: 0.5,
        packages: [{ source: "flathub", name: "Scored" }],
      },
      { ...APP, id: "unscored", category: "Utilities", iconUrl: "icon.png" },
      // No icon — excluded from the category preview despite matching category.
      { ...APP, id: "no-icon", category: "Utilities" },
      {
        ...APP,
        id: "other-source",
        category: "Utilities",
        iconUrl: "icon.png",
        popularity: 0.9,
        packages: [{ source: "snap", name: "Other" }],
      },
    ];

    await tursoClient.publish({ generatedAt: "2026-01-01T00:00:00.000Z", apps });

    const swapBatch = batch.mock.calls[1]?.[0] as { sql: string; args?: unknown[] }[];
    const args = swapBatch.find((s) => s.sql.includes("INSERT INTO meta"))?.args as unknown[];
    const idsFor = (key: string) => JSON.parse(metaValue(args, key) ?? "[]") as string[];

    // Scored apps first (by popularity), then unscored ones — never the iconless one.
    expect(idsFor("categoryPreview:Utilities")).toEqual(["other-source", "scored", "unscored"]);
    expect(idsFor("trendingBySource:flathub")).toEqual(["scored"]);
    expect(idsFor("trendingBySource:snap")).toEqual(["other-source"]);
  });

  it("renames the existing apps table out of the way before swapping when one already exists", async () => {
    const { batch, client } = fakeClient(true);
    const tursoClient = createTursoClient({ url: "file::memory:" }, client);

    await tursoClient.publish({ generatedAt: "2026-01-01T00:00:00.000Z", apps: [APP] });

    const swapBatch = batch.mock.calls[1]?.[0] as { sql: string }[];
    expect(swapBatch.some((s) => s.sql.includes("ALTER TABLE apps RENAME TO apps_old"))).toBe(true);
    expect(swapBatch.some((s) => s.sql.includes("DROP TABLE IF EXISTS apps_old"))).toBe(true);
  });
});

/** A test app: `APP` with the given fields overridden. */
function appWith(overrides: Partial<AppRecord>): AppRecord {
  return { ...APP, ...overrides };
}

/** Every `[key, value]` pair bulk-upserted into `meta` through `execute()` (the browse keys are written outside the swap batch). */
function bulkMeta(execute: { mock: { calls: unknown[][] } }): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [statement] of execute.mock.calls) {
    const { sql, args } = statement as { sql?: string; args?: unknown[] };
    if (!sql?.includes("INSERT INTO meta") || !args) continue;
    for (let i = 0; i < args.length; i += 2) entries.set(args[i] as string, args[i + 1] as string);
  }
  return entries;
}

describe("precomputed listing rows", () => {
  it("pre-renders every listing as app's summary rows, in listing order, with packages cut to what a card reads", async () => {
    const { execute, client } = fakeClient(false);
    const tursoClient = createTursoClient({ url: "file::memory:" }, client);

    await tursoClient.publish({
      generatedAt: "2026-01-01T00:00:00.000Z",
      apps: [
        {
          ...APP,
          id: "low",
          iconUrl: "low.png",
          popularity: 0.2,
          category: "Utilities",
          packages: [{ source: "aur", name: "low", channel: "git", version: "1.0", deps: ["x"] }],
        },
        {
          ...APP,
          id: "high",
          iconUrl: "high.png",
          popularity: 0.9,
          kind: "gui",
          contentType: "game",
          category: "Utilities",
          rating: { average: 4.5, count: 10 },
          packages: [
            {
              source: "flatpak-flathub",
              name: "high",
              rating: { average: 4, count: 3 },
              storeCollections: ["verified", "recently-updated"],
              screenshots: ["a.png"],
            },
          ],
        },
      ],
    });

    const meta = bulkMeta(execute);
    const rows = JSON.parse(meta.get("listingRows:trending:all") ?? "[]") as Record<
      string,
      unknown
    >[];

    expect(rows.map((row) => row.id)).toEqual(["high", "low"]);
    expect(rows[0]).toEqual({
      id: "high",
      name: "VLC",
      short_description: "Media player",
      icon_url: "high.png",
      kind: "gui",
      content_type: "game",
      category: "Utilities",
      rating_average: 4.5,
      rating_count: 10,
      packages_json: JSON.stringify([
        {
          source: "flatpak-flathub",
          rating: { average: 4, count: 3 },
          storeCollections: ["verified"],
        },
      ]),
    });
    expect(JSON.parse(rows[1]?.packages_json as string)).toEqual([
      { source: "aur", channel: "git" },
    ]);
    expect(rows[1]).toMatchObject({ kind: null, content_type: null, rating_average: null });
    // Every listing key gets its rows, same ids as the id list itself.
    expect(meta.has("listingRows:categoryPreview:Utilities")).toBe(true);
    expect(meta.has("listingRows:trendingBySource:aur")).toBe(true);
  });
});

describe("precomputed browse keys", () => {
  // generatedAt below, digits only
  const GEN = "20260101000000000";

  it("counts every non-empty filter combination under a generation, and points browseKeys at it inside the swap", async () => {
    const { execute, batch, client } = fakeClient(false);
    const tursoClient = createTursoClient({ url: "file::memory:" }, client);

    await tursoClient.publish({
      generatedAt: "2026-01-01T00:00:00.000Z",
      apps: [
        {
          ...APP,
          id: "a",
          kind: "gui",
          category: "Utilities",
          packages: [
            { source: "flathub", name: "a" },
            { source: "snap", name: "a" },
          ],
        },
        {
          ...APP,
          id: "b",
          contentType: "game",
          category: "Action",
          packages: [{ source: "flathub", name: "b" }],
        },
        { ...APP, id: "c", packages: [{ source: "aur", name: "c" }] },
      ],
    });

    const meta = bulkMeta(execute);
    const count = (key: string): number | undefined =>
      meta.has(`count:${GEN}:${key}`) ? Number(meta.get(`count:${GEN}:${key}`)) : undefined;

    expect(count("all:all:*:*")).toBe(3);
    expect(count("gui:all:*:*")).toBe(1);
    expect(count("cli:all:*:*")).toBe(2);
    expect(count("all:game:*:*")).toBe(1);
    expect(count("all:app:*:*")).toBe(2);
    expect(count("all:all:flathub:*")).toBe(2);
    expect(count("all:all:snap:*")).toBe(1);
    expect(count("all:all:*:Utilities")).toBe(1);
    expect(count("gui:app:snap:Utilities")).toBe(1);
    expect(count("cli:game:flathub:Action")).toBe(1);
    // No app is both gui and a game: a missing key is how an empty
    // combination reads (app treats it as 0), so it must not be written.
    expect(count("gui:game:*:*")).toBeUndefined();
    // An app with no category counts toward category-less keys only.
    expect(count("all:all:aur:*")).toBe(1);
    expect(
      [...meta.keys()].some((key) => key.startsWith(`count:${GEN}:`) && key.endsWith(":")),
    ).toBe(false);

    // The generation only becomes visible through the swap transaction.
    const swapBatch = batch.mock.calls.at(-1)?.[0] as { sql: string; args?: unknown[] }[];
    const swapMeta = swapBatch.find((s) => s.sql.includes("INSERT INTO meta"));
    expect(JSON.parse(metaValue(swapMeta?.args as unknown[], "browseKeys") ?? "")).toEqual({
      generation: GEN,
      sourceIdsChunkSize: 500,
    });
    expect(meta.has("browseKeys")).toBe(false);
  });

  it("drops the previous generation's rows after the swap, keeping only the current one", async () => {
    const { execute, client } = fakeClient(false);
    const tursoClient = createTursoClient({ url: "file::memory:" }, client);

    await tursoClient.publish({ generatedAt: "2026-01-01T00:00:00.000Z", apps: [APP] });

    const cleanup = execute.mock.calls
      .map(([statement]) => statement as { sql?: string; args?: unknown[] })
      .find((statement) => statement.sql?.includes("DELETE FROM meta"));
    expect(cleanup?.args).toEqual([`count:${GEN}:%`, `sourceIds:${GEN}:%`]);
    expect(cleanup?.sql).toContain("NOT LIKE");
  });

  it("orders each source's id chunks exactly like SQLite's ORDER BY name ASC (UTF-8 byte order), and chunks at 500", async () => {
    const db = createClient({ url: "file::memory:" });
    const tursoClient = createTursoClient({ url: "file::memory:" }, db);

    // Names chosen to break a naive JS comparison: case (BINARY sorts
    // uppercase first), accents, a fullwidth BMP letter (U+FF21) and an
    // emoji (outside the BMP — UTF-16 puts it *before* U+FF21, UTF-8
    // bytes after it), and two apps sharing one name.
    const tricky = ["Zebra", "apple", "Äpfel", "Ａ fullwidth", "😀 emoji", "same", "same", "Same"];
    const apps: AppRecord[] = [
      ...tricky.map((name, i) =>
        appWith({ id: `aur:tricky-${i}`, name, packages: [{ source: "aur", name }] }),
      ),
      ...Array.from({ length: 1200 }, (_, i) =>
        appWith({
          id: `aur:bulk-${String(i).padStart(4, "0")}`,
          name: `bulk-${(i * 7919) % 1200}`,
          packages: [{ source: "aur", name: "x" }],
        }),
      ),
      { ...APP, id: "flathub:other", name: "Other", packages: [{ source: "flathub", name: "o" }] },
    ];

    await tursoClient.publish({ generatedAt: "2026-01-01T00:00:00.000Z", apps });

    const rows = await db.execute(
      `SELECT key, value FROM meta WHERE key LIKE 'sourceIds:${GEN}:aur:%'`,
    );
    const chunks = rows.rows.map((row) => ({
      index: Number(String(row.key).split(":").at(-1)),
      ids: JSON.parse(String(row.value)) as string[],
    }));
    // A fresh array, safe to sort in place (toSorted() needs ES2023).
    // eslint-disable-next-line unicorn/no-array-sort
    chunks.sort((a, b) => a.index - b.index);
    expect(chunks.map((chunk) => chunk.ids.length)).toEqual([500, 500, 208]);

    const fromSql = await db.execute(
      `SELECT id FROM apps WHERE packages_json LIKE '%"source":"aur"%' ORDER BY name ASC, id ASC`,
    );
    expect(chunks.flatMap((chunk) => chunk.ids)).toEqual(fromSql.rows.map((row) => String(row.id)));

    // And the count the app uses for the total / for reading `name DESC`
    // from the end agrees with the list.
    const total = await db.execute(
      `SELECT value FROM meta WHERE key = 'count:${GEN}:all:all:aur:*'`,
    );
    expect(Number(total.rows[0]?.value)).toBe(1208);
  });

  it("replaces a previous generation instead of leaving its counts behind (a combination that dropped to zero must not keep its old count)", async () => {
    const db = createClient({ url: "file::memory:" });
    const tursoClient = createTursoClient({ url: "file::memory:" }, db);
    const game = {
      ...APP,
      id: "g",
      contentType: "game" as const,
      packages: [{ source: "gog", name: "g" }],
    };

    await tursoClient.publish({ generatedAt: "2026-01-01T00:00:00.000Z", apps: [APP, game] });
    expect(
      (await db.execute(`SELECT value FROM meta WHERE key = 'count:${GEN}:all:all:gog:*'`)).rows,
    ).toHaveLength(1);

    // Second publish: the only gog app is gone.
    await tursoClient.publish({ generatedAt: "2026-02-01T00:00:00.000Z", apps: [APP] });
    const keys = (
      await db.execute(`SELECT key FROM meta WHERE key LIKE 'count:%' OR key LIKE 'sourceIds:%'`)
    ).rows.map((row) => String(row.key));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => key.includes(":20260201000000000:"))).toBe(true);
    expect(
      JSON.parse(
        String(
          (await db.execute(`SELECT value FROM meta WHERE key = 'browseKeys'`)).rows[0]?.value,
        ),
      ),
    ).toEqual({ generation: "20260201000000000", sourceIdsChunkSize: 500 });
  });
});
