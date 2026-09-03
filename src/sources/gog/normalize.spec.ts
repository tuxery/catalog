import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { GogCacheEntry } from "./types";

describe("gog normalize", () => {
  it("maps a cache entry to a SourcedPackage", () => {
    const entry: GogCacheEntry = {
      id: "1459256379",
      title: "Firewatch",
      slug: "firewatch",
      storeLink: "https://www.gog.com/en/game/firewatch",
      developers: ["Campo Santo"],
      screenshots: ["https://images.gog-statics.com/a_product_card_v2_mobile_slider_639.jpg"],
      genres: [],
    };

    expect(normalize([entry])).toEqual([
      {
        source: "gog",
        name: "Firewatch",
        description: "",
        version: "unknown",
        appId: "firewatch",
        homepage: "https://www.gog.com/en/game/firewatch",
        hasGameCategory: true,
        developer: "Campo Santo",
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
      id: "1459256379",
      title: "Firewatch",
      slug: "firewatch",
      developers: [],
      screenshots: [],
      genres: [],
      rating: { average: 3.9, count: 2153 },
    };

    expect(normalize([entry])[0]?.rating).toEqual({ average: 3.9, count: 2153 });
  });

  it("maps GOG's own genre slugs to a categories-games.json freedesktop-equivalent key", () => {
    const entry: GogCacheEntry = {
      id: "1207658930",
      title: "The Witcher 2",
      slug: "the_witcher_2",
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
});
