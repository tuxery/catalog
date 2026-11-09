import { describe, expect, it } from "vitest";
import {
  applyFeaturedTag,
  listingToResult,
  mapCategories,
  mapChannelMap,
  mapLinks,
  mapResults,
  mergeEntries,
  pickSnapsToDetail,
  rotationSlot,
  type RawListing,
  type SnapDetails,
} from "./fetch";
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
        screenshots: ["https://example.com/shot.png"],
      },
    ]);
  });

  it("keeps the rich fields of a real listing (vlc, 2026-10-12)", () => {
    const [vlc] = mapResults([
      {
        name: "vlc",
        revision: { version: "3.0.24-rc1" },
        snap: {
          title: "VLC",
          summary: "The ultimate media player",
          description: "VLC is a free and open source cross-platform multimedia player.",
          license: "GPL-2.0+",
          publisher: { "display-name": "VideoLAN", validation: "verified" },
          media: [
            { type: "icon", url: "https://dashboard.snapcraft.io/vlc.png" },
            { type: "screenshot", url: "https://dashboard.snapcraft.io/shot-1.jpg" },
            { type: "banner", url: "https://dashboard.snapcraft.io/banner.png" },
            { type: "screenshot", url: "https://dashboard.snapcraft.io/shot-2.png" },
          ],
          links: {
            contact: ["https://www.videolan.org/support/"],
            donations: ["https://videolan.org/contribute.html"],
            issues: ["https://code.videolan.org/videolan/vlc/-/work_items"],
            source: ["https://code.videolan.org/videolan/vlc"],
            website: ["https://www.videolan.org/vlc/"],
          },
        },
      },
    ]);

    expect(vlc).toMatchObject({
      longDescription: "VLC is a free and open source cross-platform multimedia player.",
      license: "GPL-2.0+",
      publisher: "VideoLAN",
      publisherVerified: true,
      screenshots: [
        "https://dashboard.snapcraft.io/shot-1.jpg",
        "https://dashboard.snapcraft.io/shot-2.png",
      ],
      links: {
        bugtracker: "https://code.videolan.org/videolan/vlc/-/work_items",
        "vcs-browser": "https://code.videolan.org/videolan/vlc",
        donation: "https://videolan.org/contribute.html",
        contact: "https://www.videolan.org/support/",
      },
    });
  });

  it.each([
    ["verified", true],
    ["starred", undefined],
    ["unproven", undefined],
  ])("flags a %s publisher as verified: %s", (validation, expected) => {
    const [mapped] = mapResults([
      { name: "x", snap: { publisher: { "display-name": "X", validation } } },
    ]);
    expect(mapped?.publisherVerified).toBe(expected);
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
  return {
    name,
    title: name,
    summary: "",
    version: "unknown",
    channel: "stable",
  };
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

describe("mapCategories", () => {
  it("translates a store category to its freedesktop-equivalent tag", () => {
    expect(mapCategories(["development"]).categories).toEqual(["Development"]);
  });

  it("carries more than one tag for a snap in several categories", () => {
    expect(mapCategories(["development", "utilities"]).categories).toEqual([
      "Development",
      "Utility",
    ]);
  });

  it("flags the dedicated games category as hasGameCategory, not as a tag", () => {
    expect(mapCategories(["games"])).toEqual({ categories: undefined, hasGameCategory: true });
  });

  it("ignores a category with no freedesktop equivalent", () => {
    expect(mapCategories(["entertainment"])).toEqual({
      categories: undefined,
      hasGameCategory: undefined,
    });
  });
});

const listing = (name: string, overrides: Partial<RawListing> = {}): RawListing => ({
  package_name: name,
  title: name,
  summary: "A summary",
  version: "2",
  channel: "stable",
  last_updated: "2026-01-01T00:00:00+00:00",
  ...overrides,
});

// A week in which none of `names` is in rotation, so only the other rules pick them.
const quietWeek = (...names: string[]) =>
  [0, 1, 2, 3].find((week) => names.every((name) => rotationSlot(name) !== week)) ?? 0;

const known = (
  name: string,
  overrides: Partial<SnapcraftCacheEntry> = {},
): SnapcraftCacheEntry => ({
  name,
  title: name,
  summary: "An older summary",
  version: "2",
  channel: "stable",
  channels: [{ channel: "stable", version: "2" }],
  ...overrides,
});

const byName = (entries: SnapcraftCacheEntry[]) => new Map(entries.map((row) => [row.name, row]));

describe("listingToResult", () => {
  it("reads the same through mapResults as a find result does", () => {
    const [merged] = mapResults([
      listingToResult(
        listing("some-snap", {
          description: " Long text ",
          license: "MIT",
          publisher: "Someone",
          developer_validation: "verified",
          icon_url: "https://example.com/icon.png",
          screenshot_urls: ["https://example.com/shot.png"],
          links: { website: ["https://example.com/"], source: ["https://example.com/src"] },
        }),
      ),
    ]);
    expect(merged).toMatchObject({
      name: "some-snap",
      version: "2",
      channel: "stable",
      longDescription: "Long text",
      license: "MIT",
      publisher: "Someone",
      publisherVerified: true,
      iconUrl: "https://example.com/icon.png",
      screenshots: ["https://example.com/shot.png"],
      website: "https://example.com/",
      links: { "vcs-browser": "https://example.com/src" },
    });
  });
});

describe("pickSnapsToDetail", () => {
  const FETCHED_AT = "2026-06-01T00:00:00.000Z";
  it("picks a new snap and one whose version moved, and leaves an unchanged one", () => {
    const names = ["new-snap", "moved-snap", "same-snap"];
    const picked = pickSnapsToDetail(
      [listing("new-snap"), listing("moved-snap", { version: "3" }), listing("same-snap")],
      byName([known("moved-snap"), known("same-snap")]),
      FETCHED_AT,
      quietWeek(...names),
    );
    expect(picked.toSorted()).toEqual(["moved-snap", "new-snap"]);
  });

  it("picks a rebuild of the same version, released since the last run", () => {
    const picked = pickSnapsToDetail(
      [listing("rebuilt", { last_updated: "2026-06-02T00:00:00+00:00" })],
      byName([known("rebuilt")]),
      FETCHED_AT,
      quietWeek("rebuilt"),
    );
    expect(picked).toEqual(["rebuilt"]);
  });

  it("retries a listed snap left without channels", () => {
    const picked = pickSnapsToDetail(
      [listing("no-channels")],
      byName([known("no-channels", { channels: undefined })]),
      FETCHED_AT,
      quietWeek("no-channels"),
    );
    expect(picked).toEqual(["no-channels"]);
  });

  it("visits every snap once over the rotation, an unlisted one included", () => {
    const names = Array.from({ length: 40 }, (_, i) => `snap-${i}`);
    const previous = byName(names.map((name) => known(name)));
    const listed = names.slice(1).map((name) => listing(name));
    const weeks = [0, 1, 2, 3].map((week) => pickSnapsToDetail(listed, previous, FETCHED_AT, week));
    expect(weeks.flat().toSorted()).toEqual(names.toSorted());
    expect(weeks.flat()).toContain("snap-0");
  });

  it("wraps around: week 4 is week 0's share", () => {
    const previous = byName([known("a"), known("b"), known("c")]);
    expect(pickSnapsToDetail([], previous, FETCHED_AT, 4)).toEqual(
      pickSnapsToDetail([], previous, FETCHED_AT, 0),
    );
  });
});

describe("mergeEntries", () => {
  const none = new Map<string, SnapDetails>();
  const NO_FEATURED = new Set<string>();

  it("refreshes a listed snap's listing fields and keeps its channels and categories", () => {
    const [merged] = mergeEntries(
      [listing("a", { summary: "A newer summary" })],
      byName([known("a", { categories: ["Utility"], hasGameCategory: true })]),
      none,
      NO_FEATURED,
    );
    expect(merged).toMatchObject({
      summary: "A newer summary",
      channels: [{ channel: "stable", version: "2" }],
      categories: ["Utility"],
      hasGameCategory: true,
    });
  });

  it("takes channels and categories from a fresh info call", () => {
    const channels = [{ channel: "beta", version: "3" }];
    const [merged] = mergeEntries(
      [listing("a")],
      byName([known("a", { categories: ["Utility"] })]),
      new Map([["a", { status: "ok", channels, categoryNames: ["games"] }]]),
      NO_FEATURED,
    );
    expect(merged).toMatchObject({ channels, hasGameCategory: true });
    expect(merged?.categories).toBeUndefined();
  });

  it("keeps a snap no longer listed until info says it's gone", () => {
    const previous = byName([known("unlisted"), known("removed")]);
    const entries = mergeEntries(
      [],
      previous,
      new Map([["removed", { status: "gone" }]]),
      NO_FEATURED,
    );
    expect(entries.map((row) => row.name)).toEqual(["unlisted"]);
  });

  it("drops nothing when info fails, and keeps the old version so the next run asks again", () => {
    const moved = listing("a", { version: "3" });
    const previous = byName([known("a")]);
    const details = new Map<string, SnapDetails>([["a", { status: "failed" }]]);
    const [merged] = mergeEntries([moved], previous, details, NO_FEATURED);
    expect(merged).toMatchObject({ version: "2", channels: [{ channel: "stable", version: "2" }] });
    expect(
      pickSnapsToDetail([moved], byName([merged as SnapcraftCacheEntry]), undefined, 0),
    ).toContain("a");
  });

  it("keeps known snaps in their previous order: a merged app's id depends on it", () => {
    const entries = mergeEntries(
      [listing("alpha"), listing("zeta"), listing("new-snap")],
      byName([known("zeta"), known("alpha")]),
      new Map(),
      new Set(),
    );
    expect(entries.map((row) => row.name)).toEqual(["zeta", "alpha", "new-snap"]);
  });

  it("adds new snaps by name, and tags the featured ones", () => {
    const entries = mergeEntries(
      [listing("zeta"), listing("alpha")],
      new Map(),
      new Map([["alpha", { status: "ok", categoryNames: [] }]]),
      new Set(["zeta"]),
    );
    expect(entries.map((row) => row.name)).toEqual(["alpha", "zeta"]);
    expect(entries[1]?.storeCollections).toEqual(["featured"]);
    expect(entries[0]?.storeCollections).toBeUndefined();
  });

  it("doesn't change the previous cache's objects", () => {
    const previous = byName([known("a")]);
    mergeEntries(
      [],
      previous,
      new Map([["a", { status: "ok", categoryNames: [] }]]),
      new Set(["a"]),
    );
    expect(previous.get("a")?.storeCollections).toBeUndefined();
    expect(previous.get("a")?.channels).toEqual([{ channel: "stable", version: "2" }]);
  });
});

const amd64 = (name: string, version: string) => ({
  channel: { name, architecture: "amd64" },
  version,
});

describe("mapChannelMap", () => {
  it("keeps one amd64 channel per name and drops branches", () => {
    expect(
      mapChannelMap([
        amd64("v11/stable", "11.71.7"),
        {
          channel: { name: "v11/stable", architecture: "arm64" },
          version: "11.71.7",
        },
        { channel: { name: "stable", architecture: "i386" }, version: "6.4.4" },
        amd64("edge", "11.72.0"),
        amd64("22/stable/hotfix", "22.1.0"),
      ]),
    ).toEqual([
      { channel: "v11/stable", version: "11.71.7" },
      { channel: "edge", version: "11.72.0" },
    ]);
  });
});

describe("mapLinks", () => {
  it("drops contact emails and links of other schemes", () => {
    expect(
      mapLinks({ contact: ["mailto:hi@example.com"], issues: ["https://example.com/issues"] }),
    ).toEqual({ bugtracker: "https://example.com/issues" });
  });

  it("is undefined without any usable link", () => {
    expect(mapLinks({ website: ["https://example.com"] })).toBeUndefined();
    expect(mapLinks(undefined)).toBeUndefined();
  });
});

describe("mapChannelMap release dates", () => {
  it("keeps each channel's released-at as releasedAt", () => {
    expect(
      mapChannelMap([
        {
          channel: {
            name: "stable",
            architecture: "amd64",
            "released-at": "2026-09-22T13:42:44.025641+00:00",
          },
          version: "3.0.24-rc1",
        },
      ]),
    ).toEqual([
      { channel: "stable", version: "3.0.24-rc1", releasedAt: "2026-09-22T13:42:44.025641+00:00" },
    ]);
  });
});
