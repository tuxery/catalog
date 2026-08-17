import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { AlpineCacheEntry } from "./types";

describe("alpine normalize", () => {
  it("maps a cache entry to a SourcedPackage, using the name as appId", () => {
    const entry: AlpineCacheEntry = {
      name: "7zip",
      description: "File archiver with a high compression ratio",
      version: "26.01-r0",
      homepage: "https://7-zip.org/",
      repo: "main",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "apk-alpine",
        name: "7zip",
        description: "File archiver with a high compression ratio",
        version: "26.01-r0",
        appId: "7zip",
        homepage: "https://7-zip.org/",
      },
    ]);
  });
});
