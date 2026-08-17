import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { SolusCacheEntry } from "./types";

describe("solus normalize", () => {
  it("maps a cache entry to a SourcedPackage, using PartOf as section", () => {
    const entry: SolusCacheEntry = {
      name: "0ad",
      summary: "0 A.D. is a real-time strategy game",
      version: "0.27.1",
      homepage: "https://play0ad.com/",
      partOf: "games.strategy",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "solus",
        name: "0ad",
        description: "0 A.D. is a real-time strategy game",
        version: "0.27.1",
        appId: "0ad",
        homepage: "https://play0ad.com/",
        section: "games.strategy",
      },
    ]);
  });
});
