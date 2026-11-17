import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import contract from "./store-contract.json";
import { AGE_FILTERS, createTursoClient, type AppRecord } from "./turso-client";

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
  // Every bracket, and unrated apps.
  ageBracket: contract.ageBrackets.values[i % (contract.ageBrackets.values.length + 1)],
  dataConfidence: { score: 0, signals: [] },
  packages: [{ source: "aur", name: `app-${i}` }],
}));

// Out of order, with an id no app has: the listing keeps this order and drops it.
const MUST_HAVE_IDS = ["app-3", "no-such-app", "app-1"];

async function publish() {
  const db = createClient({ url: "file::memory:" });
  await createTursoClient({ url: "file::memory:" }, db).publish({
    generatedAt: GENERATED_AT,
    apps: APPS,
    mustHaveIds: MUST_HAVE_IDS,
  });
  return db;
}

async function publishedMeta(): Promise<Map<string, string>> {
  const rows = await (await publish()).execute("SELECT key, value FROM meta");
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
      ...contract.ageBrackets.filters.flatMap((age) => [
        metaKey("countAge", {
          ...counts,
          age: String(age),
          license: unset,
          source: unset,
          category: unset,
        }),
        metaKey("countAge", {
          ...counts,
          age: String(age),
          license: "free",
          source: "aur",
          category: unset,
        }),
        metaKey("countAge", {
          ...counts,
          age: String(age),
          license: "free",
          source: unset,
          category: "Utilities",
        }),
      ]),
      metaKey("sourceIds", { generation: GENERATION, source: "aur", chunk: "0" }),
      metaKey("categoryIds", { generation: GENERATION, chunk: "0", category: "Utilities" }),
      ...contract.ageBrackets.filters.flatMap((age) =>
        ["all", "app"].map((type) =>
          metaKey("ageIds", { generation: GENERATION, age: String(age), type, chunk: "0" }),
        ),
      ),
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

  it("writes the must-have listing in the given order, with the summary columns", async () => {
    const meta = await publishedMeta();
    const rows = JSON.parse(
      meta.get(metaKey("listingRows", { listing: contract.mustHaveListing })) ?? "[]",
    ) as Record<string, unknown>[];
    expect(rows.map((row) => row.id)).toEqual(["app-3", "app-1"]);
    for (const row of rows) expect(Object.keys(row)).toEqual(contract.summaryColumns);
  });

  it("writes each app's age bracket to the contract's column, out of its values, and counts each filter age", async () => {
    const db = await publish();
    const { column, values, filters } = contract.ageBrackets;
    const rows = await db.execute(
      `SELECT ${column} AS bracket, COUNT(*) AS n FROM apps GROUP BY 1`,
    );
    const brackets = rows.rows.map((row) => row.bracket);
    expect(brackets).toContain(null);
    expect(
      brackets.filter((bracket) => bracket !== null).toSorted((a, b) => Number(a) - Number(b)),
    ).toEqual(values);

    expect([...AGE_FILTERS]).toEqual(filters);
    const meta = await publishedMeta();
    const live = await Promise.all(
      filters.map((age) =>
        db.execute({ sql: `SELECT COUNT(*) AS n FROM apps WHERE ${column} <= ?`, args: [age] }),
      ),
    );
    filters.forEach((age, i) => {
      const key = metaKey("countAge", {
        generation: GENERATION,
        age: String(age),
        license: contract.unsetFilter,
        interface: "all",
        type: "all",
        source: contract.unsetFilter,
        category: contract.unsetFilter,
      });
      expect(Number(meta.get(key))).toBe(Number(live[i]?.rows[0]?.n));
    });
  });
});
