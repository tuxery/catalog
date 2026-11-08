import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RESTRICTED_SOURCES } from "./cache-path";

const SOURCES_DIR = fileURLToPath(new URL("../", import.meta.url));
const terms = JSON.parse(
  readFileSync(new URL("../../../config/source-terms.json", import.meta.url), "utf8"),
) as { sources: Record<string, { publicStorage: string; verdict: string; action?: string }> };

describe("config/source-terms.json", () => {
  it("has one record per source connector, and none for a removed one", () => {
    const connectors = readdirSync(SOURCES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !["_shared", "cache"].includes(entry.name))
      .map((entry) => entry.name)
      .toSorted();
    expect(Object.keys(terms.sources).toSorted()).toEqual(connectors);
  });

  it("agrees with RESTRICTED_SOURCES on what must not be stored publicly", () => {
    const forbidden = Object.entries(terms.sources)
      .filter(([, record]) => record.publicStorage === "forbidden")
      .map(([source]) => source);
    expect(new Set(forbidden)).toEqual(RESTRICTED_SOURCES);
  });

  it("says what to do about every source waiting on the owner", () => {
    const withoutAction = Object.entries(terms.sources)
      .filter(([, record]) => record.verdict === "owner-review" && !record.action)
      .map(([source]) => source);
    expect(withoutAction).toEqual([]);
  });
});
