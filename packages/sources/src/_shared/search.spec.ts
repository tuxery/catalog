import { describe, expect, it, vi } from "vitest";
import type { SourcedPackage } from "../types";
import { makeCacheSearch } from "./search";

// No temp-file setup needed: `readNdjson` already treats a missing file
// as an empty array (see ndjson.spec.ts), which this leans on as a
// deterministic fixture — a cache name that can't exist on disk.

describe("makeCacheSearch", () => {
  it("reads the (missing) cache and passes the result straight to normalize", async () => {
    const normalize = vi.fn<(entries: unknown[]) => SourcedPackage[]>(() => []);
    const search = makeCacheSearch("__does-not-exist__", normalize);

    const result = await search("anything");

    expect(normalize).toHaveBeenCalledWith([]);
    expect(result).toEqual([]);
  });

  it("returns whatever normalize produces, unchanged", async () => {
    const fakePackage: SourcedPackage = {
      source: "deb-debian",
      name: "example",
      description: "",
      version: "1.0.0",
    };
    const normalize = vi.fn<(entries: unknown[]) => SourcedPackage[]>(() => [fakePackage]);
    const search = makeCacheSearch("__does-not-exist__", normalize);

    await expect(search("anything")).resolves.toEqual([fakePackage]);
  });

  it("ignores the query argument entirely — every source's real search is cache-only", async () => {
    const normalize = vi.fn<(entries: unknown[]) => SourcedPackage[]>(() => []);
    const search = makeCacheSearch("__does-not-exist__", normalize);

    await search("firefox");
    await search("");
    await search("anything else");

    // Same cache read every time, regardless of query — normalize always
    // sees the identical (empty) input.
    expect(normalize).toHaveBeenCalledTimes(3);
    for (const call of normalize.mock.calls) {
      expect(call[0]).toEqual([]);
    }
  });
});
