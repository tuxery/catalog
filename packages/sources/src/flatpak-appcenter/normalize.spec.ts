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
      hasGameCategory: false,
    };

    expect(normalize([entry])).toEqual([
      {
        source: "flatpak-appcenter",
        name: "Akira",
        description: "The Linux Design Tool",
        version: "0.0.16",
        appId: "com.github.akiraux.akira",
        iconFilename: "com.github.akiraux.akira.png",
        homepage: "https://akiraux.org",
        hasGameCategory: false,
      },
    ]);
  });

  it("falls back to 'unknown' version when there are no releases", () => {
    const entry: AppCenterCacheEntry = {
      id: "com.example.NoReleases",
      name: "No Releases",
      summary: "Has no releases yet",
      hasGameCategory: false,
    };

    expect(normalize([entry])[0]?.version).toBe("unknown");
  });

  it("carries hasGameCategory through when true", () => {
    const entry: AppCenterCacheEntry = {
      id: "com.example.Game",
      name: "Game",
      summary: "A game",
      hasGameCategory: true,
    };

    expect(normalize([entry])[0]?.hasGameCategory).toBe(true);
  });
});
