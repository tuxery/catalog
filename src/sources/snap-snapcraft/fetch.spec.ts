import { describe, expect, it } from "vitest";
import { applyCategories, applyFeaturedTag, mapResults, sweepQueriesRecursively } from "./fetch";
import type { SnapcraftCacheEntry } from "./types";

describe("mapResults", () => {
  it("maps a result to a SnapcraftCacheEntry", () => {
    const results = [
      {
        name: "firefox",
        revision: { channel: "stable", version: "153.0.4-1" },
        snap: {
          title: "firefox",
          summary: "Mozilla Firefox web browser",
          media: [
            {
              type: "icon",
              url: "https://dashboard.snapcraft.io/site_media/appmedia/2021/12/firefox_logo.png",
            },
            { type: "screenshot", url: "https://example.com/shot.png" },
          ],
          links: { website: ["https://www.mozilla.org/firefox/"] },
        },
      },
    ];

    expect(mapResults(results)).toEqual([
      {
        name: "firefox",
        title: "firefox",
        summary: "Mozilla Firefox web browser",
        version: "153.0.4-1",
        channel: "stable",
        iconUrl: "https://dashboard.snapcraft.io/site_media/appmedia/2021/12/firefox_logo.png",
        website: "https://www.mozilla.org/firefox/",
      },
    ]);
  });

  it("falls back gracefully when optional fields are missing", () => {
    const results = [{ name: "bare-snap" }];

    expect(mapResults(results)).toEqual([
      {
        name: "bare-snap",
        title: "bare-snap",
        summary: "",
        version: "unknown",
        channel: "stable",
        iconUrl: undefined,
        website: undefined,
      },
    ]);
  });

  it("drops results without a name", () => {
    expect(mapResults([{ name: "" }])).toEqual([]);
  });
});

function entry(name: string): SnapcraftCacheEntry {
  return { name, title: name, summary: "", version: "unknown", channel: "stable" };
}

describe("applyFeaturedTag", () => {
  it("tags entries whose name is in the featured set", () => {
    const tagged = applyFeaturedTag([entry("code"), entry("spotify")], new Set(["code"]));

    expect(tagged.find((e) => e.name === "code")?.storeCollections).toEqual(["featured"]);
    expect(tagged.find((e) => e.name === "spotify")?.storeCollections).toBeUndefined();
  });

  it("leaves storeCollections undefined for an empty featured set", () => {
    const tagged = applyFeaturedTag([entry("code")], new Set());
    expect(tagged[0]?.storeCollections).toBeUndefined();
  });
});

describe("applyCategories", () => {
  it("translates a swept Snap category to its freedesktop-equivalent tag", () => {
    const tagged = applyCategories([entry("gimp")], new Map([["art-and-design", ["gimp"]]]));

    expect(tagged[0]?.categories).toEqual(["Graphics"]);
    expect(tagged[0]?.hasGameCategory).toBeUndefined();
  });

  it("carries more than one freedesktop tag when a snap swept under multiple categories", () => {
    const tagged = applyCategories(
      [entry("krita")],
      new Map([
        ["art-and-design", ["krita"]],
        ["photo-and-video", ["krita"]],
      ]),
    );

    expect(tagged[0]?.categories).toEqual(expect.arrayContaining(["Graphics", "Photography"]));
    expect(tagged[0]?.categories).toHaveLength(2);
  });

  it("flags the dedicated games category as hasGameCategory, not as a categories tag", () => {
    const tagged = applyCategories([entry("0ad")], new Map([["games", ["0ad"]]]));

    expect(tagged[0]?.hasGameCategory).toBe(true);
    expect(tagged[0]?.categories).toBeUndefined();
  });

  it("ignores a swept category with no freedesktop equivalent", () => {
    const tagged = applyCategories([entry("chezmoi")], new Map([["personalisation", ["chezmoi"]]]));

    expect(tagged[0]?.categories).toBeUndefined();
    expect(tagged[0]?.hasGameCategory).toBeUndefined();
  });

  it("leaves an unswept entry untouched", () => {
    const tagged = applyCategories([entry("code")], new Map([["development", ["other-snap"]]]));

    expect(tagged[0]?.categories).toBeUndefined();
    expect(tagged[0]?.hasGameCategory).toBeUndefined();
  });
});

async function findSharedSnapUnderTwoPrefixes(prefix: string) {
  return prefix === "a" || prefix === "b" ? [{ name: "shared-snap" }] : [];
}

describe("sweepQueriesRecursively", () => {
  const CAPPED_RESULTS = Array.from({ length: 100 }, (_, i) => ({ name: `capped-${i}` }));

  it("does not recurse into a prefix that comes back under the 100-result cap", async () => {
    const calls: string[] = [];
    const find = async (prefix: string) => {
      calls.push(prefix);
      return prefix === "a" ? [{ name: "audacity" }] : [];
    };

    const { results, prefixesTried } = await sweepQueriesRecursively(find);

    expect(results).toEqual(expect.arrayContaining([{ name: "audacity" }]));
    expect(calls.filter((c) => c.startsWith("a")).length).toBe(1); // just "a", no "aa".."a9"
    expect(prefixesTried).toBe(36); // the base alphabet, once
  });

  it("recurses one level deeper for a prefix that comes back exactly at the cap", async () => {
    const find = async (prefix: string) => (prefix === "a" ? CAPPED_RESULTS : []);

    const { prefixesTried } = await sweepQueriesRecursively(find);

    // 36 base prefixes, plus 36 more ("aa".."a9") from "a" hitting the cap.
    expect(prefixesTried).toBe(36 + 36);
  });

  it("deduplicates the same snap surfacing under more than one prefix", async () => {
    const { results } = await sweepQueriesRecursively(findSharedSnapUnderTwoPrefixes);

    expect(results.filter((r) => r.name === "shared-snap")).toHaveLength(1);
  });

  it("bounds recursion at MAX_QUERY_DEPTH even if every prefix keeps hitting the cap", async () => {
    // Only the "a" branch stays capped at every depth — bounds the test's
    // own runtime while still proving the depth limit kicks in rather
    // than recursing forever.
    const find = async (prefix: string) =>
      /^a+$/.test(prefix) ? CAPPED_RESULTS : [];

    const { prefixesTried } = await sweepQueriesRecursively(find);

    // depth 1: 36, depth 2: 36 ("a" capped), depth 3: 36 ("aa" capped),
    // depth 4: 36 ("aaa" capped) — depth 5 never happens (MAX_QUERY_DEPTH
    // is 4), even though "aaaa" would also come back capped.
    expect(prefixesTried).toBe(36 * 4);
  });
});
