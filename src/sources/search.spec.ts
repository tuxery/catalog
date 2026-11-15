import { describe, expect, it } from "vitest";
import { WITHHELD_SOURCES } from "./_shared/cache-path";
import { searchAllSources } from "./search";

describe("searchAllSources", () => {
  // Reads every source's cache (about 300 MB): well past the default 5 s on a busy runner.
  it(
    "returns packages from the caches, and none from a withheld source",
    { timeout: 60_000 },
    async () => {
      const results = await searchAllSources("discord");
      expect(results.length).toBeGreaterThan(0);
      expect(results.filter((pkg) => WITHHELD_SOURCES.has(pkg.source))).toEqual([]);
    },
  );
});
