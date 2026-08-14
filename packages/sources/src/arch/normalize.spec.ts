import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { ArchCacheEntry } from "./types";

describe("arch normalize", () => {
  it("maps a cache entry to a SourcedPackage, using the name as appId", () => {
    const entry: ArchCacheEntry = {
      name: "0ad",
      description: "Cross-platform, 3D and historically-based real-time strategy game",
      version: "0.28.0-3",
      homepage: "http://play0ad.com/",
      repo: "extra",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "arch",
        name: "0ad",
        description: "Cross-platform, 3D and historically-based real-time strategy game",
        version: "0.28.0-3",
        appId: "0ad",
        homepage: "http://play0ad.com/",
      },
    ]);
  });
});
