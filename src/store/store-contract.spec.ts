import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import contract from "./store-contract.json";
import { createTursoClient, type AppRecord } from "./turso-client";

// Pins what publish() writes to store-contract.json, the file `app`'s
// catalog.ts is pinned to on its side (CI keeps the two copies equal).
// Goes through a real publish into an in-memory database, so it checks
// the rows `app` reads, not constants that could drift from them.

const GENERATED_AT = "2026-01-01T00:00:00.000Z";
const GENERATION = "20260101000000000";

/** A `metaKeyFormats` entry with its `{placeholder}`s filled in. */
function metaKey(format: keyof typeof contract.metaKeyFormats, values: Record<string, string>) {
  return contract.metaKeyFormats[format].replaceAll(/\{(\w+)\}/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`no value for {${name}} in ${format}`);
    return value;
  });
}

// More apps than either listing holds, so both come out capped at their size.
const APPS: AppRecord[] = Array.from({ length: contract.listingSizes.trending + 10 }, (_, i) => ({
  id: `app-${i}`,
  name: `App ${i}`,
  shortDescription: "An app",
  iconUrl: `icon-${i}.png`,
  popularity: i,
  kind: "gui",
  category: "Utilities",
  licenseKind: "free",
  dataConfidence: { score: 0, signals: [] },
  packages: [{ source: "aur", name: `app-${i}` }],
}));

async function publishedMeta(): Promise<Map<string, string>> {
  const db = createClient({ url: "file::memory:" });
  await createTursoClient({ url: "file::memory:" }, db).publish({
    generatedAt: GENERATED_AT,
    apps: APPS,
  });
  const rows = await db.execute("SELECT key, value FROM meta");
  return new Map(rows.rows.map((row) => [String(row.key), String(row.value)]));
}

describe("store contract (store-contract.json)", () => {
  it("writes the browseKeys row under its key, with exactly the contract's fields", async () => {
    const meta = await publishedMeta();
    const browseKeys = JSON.parse(meta.get(contract.browseKeys.metaKey) ?? "null") as object;
    expect(Object.keys(browseKeys).toSorted()).toEqual(contract.browseKeys.fields.toSorted());
    expect(browseKeys).toMatchObject({ generation: GENERATION });
  });

  it("writes every browse key in the contract's formats, with its unset filter", async () => {
    const meta = await publishedMeta();
    const unset = contract.unsetFilter;
    const counts = { generation: GENERATION, interface: "gui", type: "app" };
    const keys = [
      metaKey("count", { ...counts, source: "aur", category: "Utilities" }),
      metaKey("count", { ...counts, source: unset, category: unset }),
      metaKey("countFree", { ...counts, source: "aur", category: unset }),
      metaKey("sourceIds", { generation: GENERATION, source: "aur", chunk: "0" }),
      metaKey("categoryIds", { generation: GENERATION, chunk: "0", category: "Utilities" }),
    ];
    expect(keys.filter((key) => !meta.has(key))).toEqual([]);
  });

  it("writes listing rows with the summary columns, capped at the listing sizes", async () => {
    const meta = await publishedMeta();
    const listing = (name: string) =>
      JSON.parse(meta.get(metaKey("listingRows", { listing: name })) ?? "[]") as object[];

    const trending = listing("trending:all");
    expect(trending).toHaveLength(contract.listingSizes.trending);
    for (const row of trending) expect(Object.keys(row)).toEqual(contract.summaryColumns);
    expect(listing("categoryPreview:Utilities")).toHaveLength(
      contract.listingSizes.categoryPreview,
    );
  });
});
