import { describe, expect, it } from "vitest";
import {
  buildStoreCollectionTags,
  parseAppstream,
  rankPopularity,
  resolveDownloadStats,
  sumLast7Days,
  toDownloadStats,
} from "./fetch";
import type { FlathubCacheEntry } from "./types";

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<components version="0.8" origin="flathub">
  <component type="desktop-application">
    <id>org.mozilla.firefox</id>
    <name>Firefox</name>
    <summary>Fast, Private &amp; Safe Web Browser</summary>
    <releases>
      <release timestamp="1786320000" version="153.0.4"/>
    </releases>
  </component>
  <component type="desktop-application">
    <id>org.example.RemoteIcon</id>
    <name>Remote Icon</name>
    <summary>Has a ready-to-use remote icon URL</summary>
    <icon type="cached" width="128" height="128">org.example.RemoteIcon.png</icon>
    <icon type="remote" width="128" height="128">https://dl.flathub.org/media/org/example/RemoteIcon/icon.png</icon>
  </component>
  <component type="desktop-application">
    <id>org.example.CachedOnly</id>
    <name>Cached Only</name>
    <summary>Only has a cached-filename icon, no remote URL</summary>
    <icon type="cached" width="128" height="128">org.example.CachedOnly.png</icon>
  </component>
</components>
`;

const ODRS_RATINGS = new Map([["org.mozilla.firefox.desktop", { average: 3.9, count: 778 }]]);
const POPULARITY_RANKS = new Map([["org.mozilla.firefox", 0.9]]);

describe("parseAppstream", () => {
  const entries = parseAppstream(FIXTURE, ODRS_RATINGS, POPULARITY_RANKS);

  it("delegates to the shared AppStream parser", () => {
    const firefox = entries.find((entry) => entry.id === "org.mozilla.firefox");

    expect(firefox).toEqual({
      id: "org.mozilla.firefox",
      name: "Firefox",
      summary: "Fast, Private & Safe Web Browser",
      version: "153.0.4",
      iconFilename: undefined,
      iconUrl: undefined,
      homepage: undefined,
      hasGameCategory: false,
      categories: [],
      license: undefined,
      developer: undefined,
      longDescription: undefined,
      screenshots: [],
      changelog: undefined,
      lastUpdated: "2026-08-10T00:00:00.000Z",
      rating: { average: 3.9, count: 778 },
      popularity: 0.9,
      storeCollections: undefined,
    });
  });

  it("leaves popularity undefined for an id outside the Popular collection", () => {
    const entry = entries.find((e) => e.id === "org.example.RemoteIcon");

    expect(entry?.popularity).toBeUndefined();
  });

  it("prefers a ready-to-use remote icon URL when present", () => {
    const entry = entries.find((e) => e.id === "org.example.RemoteIcon");

    expect(entry?.iconUrl).toBe("https://dl.flathub.org/media/org/example/RemoteIcon/icon.png");
  });

  it("resolves the icon URL against Flathub's own repo base when there's no remote icon", () => {
    const entry = entries.find((e) => e.id === "org.example.CachedOnly");

    expect(entry?.iconUrl).toBe(
      "https://dl.flathub.org/repo/appstream/x86_64/icons/128x128/org.example.CachedOnly.png",
    );
  });

  it("leaves rating undefined for an id with no ODRS entry", () => {
    const entry = entries.find((e) => e.id === "org.example.RemoteIcon");

    expect(entry?.rating).toBeUndefined();
  });

  it("threads storeCollections tags through by id, leaving untagged ids undefined", () => {
    const tagged = parseAppstream(
      FIXTURE,
      ODRS_RATINGS,
      POPULARITY_RANKS,
      new Map([["org.mozilla.firefox", ["verified", "recently-updated"]]]),
    );

    expect(tagged.find((e) => e.id === "org.mozilla.firefox")?.storeCollections).toEqual([
      "verified",
      "recently-updated",
    ]);
    expect(tagged.find((e) => e.id === "org.example.RemoteIcon")?.storeCollections).toBeUndefined();
  });
});

describe("rankPopularity", () => {
  it("scores rank 1 as 1, decreasing towards 0 for the last hit", () => {
    const hits = [{ app_id: "a" }, { app_id: "b" }, { app_id: "c" }];

    const ranks = rankPopularity(hits);
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("b")).toBeCloseTo(0.5, 5);
    expect(ranks.get("c")).toBe(0);
  });

  it("skips hits with no app_id", () => {
    const ranks = rankPopularity([{ app_id: "a" }, {}]);
    expect(ranks.size).toBe(1);
  });

  it("scores the sole hit as 1 rather than dividing by zero", () => {
    const ranks = rankPopularity([{ app_id: "only" }]);
    expect(ranks.get("only")).toBe(1);
  });
});

describe("buildStoreCollectionTags", () => {
  it("tags each id with the collection(s) it appears in", () => {
    const tags = buildStoreCollectionTags([
      { tag: "verified", ids: ["a", "b"] },
      { tag: "recently-added", ids: ["b", "c"] },
    ]);

    expect(tags.get("a")).toEqual(["verified"]);
    expect(tags.get("b")).toEqual(["verified", "recently-added"]);
    expect(tags.get("c")).toEqual(["recently-added"]);
    expect(tags.has("d")).toBe(false);
  });

  it("returns an empty map for no collections", () => {
    expect(buildStoreCollectionTags([]).size).toBe(0);
  });
});

describe("sumLast7Days", () => {
  it("sums the 7 most recent dates, ignoring older ones", () => {
    const perDay = {
      "2026-08-20": 100,
      "2026-08-21": 100,
      "2026-08-22": 100,
      "2026-08-23": 100,
      "2026-08-24": 100,
      "2026-08-25": 100,
      "2026-08-26": 100,
      // Older, outside the last-7-days window — must not be counted.
      "2026-08-19": 9999,
    };

    expect(sumLast7Days(perDay)).toBe(700);
  });

  it("returns undefined with fewer than 7 days of history", () => {
    const perDay = { "2026-08-25": 10, "2026-08-26": 20 };

    expect(sumLast7Days(perDay)).toBeUndefined();
  });
});

describe("toDownloadStats", () => {
  it("maps installs_total and sums the last 7 days", () => {
    const perDay = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`2026-08-${20 + i}`, 10]),
    );

    expect(toDownloadStats({ installs_total: 500, installs_per_day: perDay })).toEqual({
      installsTotal: 500,
      installsLast7Days: 70,
    });
  });

  it("returns undefined when installs_total itself is missing", () => {
    expect(toDownloadStats({ installs_per_day: { "2026-08-26": 10 } })).toBeUndefined();
  });

  it("leaves installsLast7Days undefined when there's no daily series at all", () => {
    expect(toDownloadStats({ installs_total: 500 })).toEqual({
      installsTotal: 500,
      installsLast7Days: undefined,
    });
  });
});

function statsEntry(id: string): FlathubCacheEntry {
  return { id, name: id, summary: "", hasGameCategory: false, categories: [], screenshots: [] };
}

async function lookupById(id: string): Promise<{ installsTotal: number } | undefined> {
  return { installsTotal: id === "a" ? 100 : 200 };
}

async function lookupNothing(): Promise<undefined> {
  return undefined;
}

describe("resolveDownloadStats", () => {
  it("attaches each entry's resolved stats", async () => {
    const entries = [statsEntry("a"), statsEntry("b")];

    const resolved = await resolveDownloadStats(entries, lookupById, 2);

    expect(resolved.map((e) => e.installsTotal)).toEqual([100, 200]);
  });

  it("keeps an entry with no stats, just without the two new fields", async () => {
    const entries = [statsEntry("no-stats")];

    const resolved = await resolveDownloadStats(entries, lookupNothing, 2);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.installsTotal).toBeUndefined();
  });
});
