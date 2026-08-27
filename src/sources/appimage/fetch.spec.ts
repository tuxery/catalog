import { describe, expect, it, vi } from "vitest";
import { mapItems, resolveEntries } from "./fetch";
import type { RepoLookupResult } from "./fetch";
import type { AppImageCacheEntry } from "./types";

describe("mapItems", () => {
  it("maps an item with a GitHub link to a cache entry", () => {
    const items = [
      {
        name: "Krita",
        description: "Digital painting, illustration, and animation",
        links: [
          { type: "GitHub", url: "KDE/krita" },
          { type: "Download", url: "https://github.com/KDE/krita/releases" },
        ],
        icons: ["Krita/icons/512x512/krita.png"],
      },
    ];

    expect(mapItems(items)).toEqual([
      {
        name: "Krita",
        description: "Digital painting, illustration, and animation",
        repo: "KDE/krita",
        iconFilename: "krita.png",
        homepage: "https://github.com/KDE/krita",
      },
    ]);
  });

  it("drops items with no GitHub link", () => {
    const items = [
      {
        name: "No Repo",
        description: "Nothing to link to",
        links: [{ type: "Download", url: "x" }],
      },
      { name: "Null Links", description: "links is null in the real feed sometimes", links: null },
    ];

    expect(mapItems(items)).toEqual([]);
  });

  it("drops items with no name", () => {
    expect(mapItems([{ links: [{ type: "GitHub", url: "owner/repo" }] }])).toEqual([]);
  });

  it("falls back to an empty description and no icon when absent", () => {
    const items = [{ name: "Bare", links: [{ type: "GitHub", url: "owner/bare" }] }];

    expect(mapItems(items)).toEqual([
      {
        name: "Bare",
        description: "",
        repo: "owner/bare",
        iconFilename: undefined,
        homepage: "https://github.com/owner/bare",
      },
    ]);
  });
});

function entry(overrides: Partial<AppImageCacheEntry>): AppImageCacheEntry {
  return { name: "example", description: "", repo: "owner/example", ...overrides };
}

describe("resolveEntries", () => {
  it("attaches each entry's resolved version", async () => {
    const entries = [entry({ repo: "a/a" }), entry({ repo: "b/b" })];
    const lookup = vi.fn<(repo: string) => Promise<RepoLookupResult>>(async (repo) => ({
      exists: true,
      version: `${repo}-v1`,
    }));

    const resolved = await resolveEntries(entries, lookup, 2);

    expect(resolved.map((e) => e.version)).toEqual(["a/a-v1", "b/b-v1"]);
  });

  it("leaves version undefined when a repo exists but has no releases", async () => {
    const entries = [entry({ repo: "has-releases" }), entry({ repo: "no-releases" })];
    const lookup = vi.fn<(repo: string) => Promise<RepoLookupResult>>(async (repo) => ({
      exists: true,
      version: repo === "no-releases" ? undefined : "v2.0.0",
    }));

    const resolved = await resolveEntries(entries, lookup, 2);

    expect(resolved.find((e) => e.repo === "has-releases")?.version).toBe("v2.0.0");
    expect(resolved.find((e) => e.repo === "no-releases")?.version).toBeUndefined();
  });

  it("drops entries whose repo is confirmed gone", async () => {
    const entries = [entry({ repo: "still-here" }), entry({ repo: "deleted-or-renamed" })];
    const lookup = vi.fn<(repo: string) => Promise<RepoLookupResult>>(async (repo) => ({
      exists: repo !== "deleted-or-renamed",
    }));

    const resolved = await resolveEntries(entries, lookup, 2);

    expect(resolved.map((e) => e.repo)).toEqual(["still-here"]);
  });

  it("respects a concurrency cap smaller than the entry count", async () => {
    const entries = Array.from({ length: 10 }, (_, i) => entry({ repo: `owner/repo-${i}` }));
    let inFlight = 0;
    let maxInFlight = 0;
    const lookup = vi.fn<(repo: string) => Promise<RepoLookupResult>>(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return { exists: true, version: "v1" };
    });

    await resolveEntries(entries, lookup, 3);

    expect(lookup).toHaveBeenCalledTimes(10);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });
});
