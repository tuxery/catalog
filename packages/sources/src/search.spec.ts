import { describe, expect, it } from "vitest";
import { searchAllSources } from "./search";

describe("searchAllSources", () => {
  it("resolves with an array (stub connectors return no results yet)", async () => {
    const results = await searchAllSources("discord");
    expect(Array.isArray(results)).toBe(true);
  });
});
