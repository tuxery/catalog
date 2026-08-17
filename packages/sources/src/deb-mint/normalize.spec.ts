import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { MintCacheEntry } from "./types";

describe("mint normalize", () => {
  it("maps a cache entry to a SourcedPackage", () => {
    const entry: MintCacheEntry = {
      name: "bulky",
      description: "Bulk Renamer",
      version: "4.2",
      homepage: "https://github.com/linuxmint/bulky",
      section: "misc",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "deb-mint",
        name: "bulky",
        description: "Bulk Renamer",
        version: "4.2",
        appId: "bulky",
        homepage: "https://github.com/linuxmint/bulky",
        section: "misc",
      },
    ]);
  });
});
