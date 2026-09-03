import type { Client } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import { createTursoClient, type AppRecord } from "./turso-client";

const APP: AppRecord = {
  id: "flathub:org.videolan.VLC",
  name: "VLC",
  shortDescription: "Media player",
  packages: [{ source: "flathub", name: "VLC" }],
};

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

    const executedSql = execute.mock.calls.map((call) => call[0] as string);
    for (const column of [
      "category",
      "content_type",
      "popularity",
      "last_updated",
      "installs_last_7_days",
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
    const firstIndexOrder = execute.mock.invocationCallOrder[executedSql.indexOf(indexStatements[0] ?? "")];
    expect(firstIndexOrder).toBeGreaterThan(swapBatchOrder ?? 0);
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
