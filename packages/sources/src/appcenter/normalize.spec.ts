import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { AppCenterCacheEntry } from "./types";

describe("appcenter normalize", () => {
  it("maps a cache entry to a SourcedPackage", () => {
    const entry: AppCenterCacheEntry = {
      id: "com.github.akiraux.akira",
      name: "Akira",
      summary: "The Linux Design Tool",
      version: "0.0.16",
      iconFilename: "com.github.akiraux.akira.png",
      homepage: "https://akiraux.org",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "appcenter",
        name: "Akira",
        description: "The Linux Design Tool",
        version: "0.0.16",
        appId: "com.github.akiraux.akira",
        iconFilename: "com.github.akiraux.akira.png",
        homepage: "https://akiraux.org",
      },
    ]);
  });

  it("falls back to 'unknown' version when there are no releases", () => {
    const entry: AppCenterCacheEntry = {
      id: "com.example.NoReleases",
      name: "No Releases",
      summary: "Has no releases yet",
    };

    expect(normalize([entry])[0]?.version).toBe("unknown");
  });
});
