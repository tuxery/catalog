import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { OpenSuseCacheEntry } from "./types";

describe("opensuse normalize", () => {
  it("maps a cache entry to a SourcedPackage, using the name as appId and group as section", () => {
    const entry: OpenSuseCacheEntry = {
      name: "0ad",
      summary: "Cross-Platform RTS Game of Ancient Warfare",
      version: "0.28.0",
      homepage: "https://play0ad.com/",
      repo: "oss",
      group: "Amusements/Games/Strategy/Real Time",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "opensuse",
        name: "0ad",
        description: "Cross-Platform RTS Game of Ancient Warfare",
        version: "0.28.0",
        appId: "0ad",
        homepage: "https://play0ad.com/",
        section: "Amusements/Games/Strategy/Real Time",
      },
    ]);
  });

  it("leaves section undefined when the group is absent", () => {
    const entry: OpenSuseCacheEntry = {
      name: "0ad-data",
      summary: "Data files for 0ad",
      version: "0.28.0",
      repo: "oss",
    };

    expect(normalize([entry])[0]?.section).toBeUndefined();
  });
});
