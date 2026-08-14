import { describe, expect, it } from "vitest";
import { mapResults } from "./fetch";

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
