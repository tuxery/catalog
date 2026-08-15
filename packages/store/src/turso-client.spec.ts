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
    expect(swapBatch.some((s) => s.sql.includes("ALTER TABLE apps_next RENAME TO apps"))).toBe(true);
    expect(swapBatch.some((s) => s.sql.includes("INSERT INTO meta"))).toBe(true);
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
