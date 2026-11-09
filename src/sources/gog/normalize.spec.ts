import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { GogCacheEntry } from "./types";

const reviewed = (id: string, count: number): GogCacheEntry => ({
  id,
  title: id,
  slug: id,
  developers: [],
  screenshots: [],
  genres: [],
  rating: count ? { average: 4, count } : undefined,
});

describe("gog normalize", () => {
  it("maps a cache entry to a SourcedPackage", () => {
    const entry: GogCacheEntry = {
      id: "1000000001",
      title: "Lantern Keep",
      slug: "lantern-keep",
      storeLink: "https://www.gog.com/en/game/lantern-keep",
      developers: ["Example Studio"],
      screenshots: ["https://images.gog-statics.com/a_product_card_v2_mobile_slider_639.jpg"],
      genres: [],
    };

    expect(normalize([entry])).toEqual([
      {
        source: "gog",
        name: "Lantern Keep",
        description: "",
        version: "unknown",
        appId: "lantern-keep",
        homepage: "https://www.gog.com/en/game/lantern-keep",
        hasGameCategory: true,
        developer: "Example Studio",
        screenshots: ["https://images.gog-statics.com/a_product_card_v2_mobile_slider_639.jpg"],
      },
    ]);
  });

  it("falls back to a constructed store URL when storeLink is missing", () => {
    const entry: GogCacheEntry = {
      id: "1",
      title: "App",
      slug: "app",
      developers: [],
      screenshots: [],
      genres: [],
    };

    expect(normalize([entry])[0]?.homepage).toBe("https://www.gog.com/game/app");
  });

  it("leaves developer undefined when there are no developers", () => {
    const entry: GogCacheEntry = {
      id: "1",
      title: "App",
      slug: "app",
      developers: [],
      screenshots: [],
      genres: [],
    };

    expect(normalize([entry])[0]?.developer).toBeUndefined();
  });

  it("leaves screenshots undefined (not an empty array) when there are none", () => {
    const entry: GogCacheEntry = {
      id: "1",
      title: "App",
      slug: "app",
      developers: [],
      screenshots: [],
      genres: [],
    };

    expect(normalize([entry])[0]?.screenshots).toBeUndefined();
  });

  it("always sets hasGameCategory — every entry already passed fetch.ts's productType filter", () => {
    const entry: GogCacheEntry = {
      id: "1",
      title: "App",
      slug: "app",
      developers: [],
      screenshots: [],
      genres: [],
    };

    expect(normalize([entry])[0]?.hasGameCategory).toBe(true);
  });

  it("passes the cache entry's rating through unchanged", () => {
    const entry: GogCacheEntry = {
      id: "1000000001",
      title: "Lantern Keep",
      slug: "lantern-keep",
      developers: [],
      screenshots: [],
      genres: [],
      rating: { average: 4, count: 1200 },
    };

    expect(normalize([entry])[0]?.rating).toEqual({ average: 4, count: 1200 });
  });

  it("maps GOG's own genre slugs to a categories-games.json freedesktop-equivalent key", () => {
    const entry: GogCacheEntry = {
      id: "1000000002",
      title: "Invented Quest 2",
      slug: "invented_quest_2",
      developers: [],
      screenshots: [],
      genres: ["rpg", "action", "fantasy"],
    };

    expect(normalize([entry])[0]?.categories).toEqual(["RolePlaying", "ActionGame"]);
  });

  it("leaves categories undefined when no genre slug maps (theme-only tags, or none at all)", () => {
    const entry: GogCacheEntry = {
      id: "1",
      title: "App",
      slug: "app",
      developers: [],
      screenshots: [],
      genres: ["fantasy", "scifi"],
    };

    expect(normalize([entry])[0]?.categories).toBeUndefined();
  });

  it("scores each game's popularity by its review count, among GOG's games", () => {
    const byName = Object.fromEntries(
      normalize([reviewed("a", 900), reviewed("b", 90), reviewed("c", 9), reviewed("d", 0)]).map(
        (pkg) => [pkg.name, pkg.popularity],
      ),
    );
    expect(byName).toEqual({ a: 1, b: 0.5, c: 0, d: undefined });
  });
});
