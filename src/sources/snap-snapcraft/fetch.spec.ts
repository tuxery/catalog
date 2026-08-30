import { describe, expect, it } from "vitest";
import { applyFeaturedTag, mapResults } from "./fetch";
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
