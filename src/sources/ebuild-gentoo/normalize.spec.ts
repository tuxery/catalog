import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { GentooCacheEntry } from "./types";

describe("gentoo normalize", () => {
  it("maps a cache entry to a SourcedPackage, using category/name as appId and category as section", () => {
    const entry: GentooCacheEntry = {
      category: "games-strategy",
      name: "0ad",
      version: "0.28.0-r1",
      description: "A free, real-time strategy game",
      homepage: "https://play0ad.com/",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "ebuild-gentoo",
        name: "0ad",
        description: "A free, real-time strategy game",
        version: "0.28.0-r1",
        appId: "games-strategy/0ad",
        homepage: "https://play0ad.com/",
        section: "games-strategy",
      },
    ]);
  });
});
