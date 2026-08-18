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
      categories: ["Graphics"],
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
        categories: ["Graphics"],
      },
    ]);
  });

  it("falls back to 'unknown' version when there are no releases", () => {
    const entry: AppCenterCacheEntry = {
      id: "com.example.NoReleases",
      name: "No Releases",
      summary: "Has no releases yet",
      hasGameCategory: false,
      categories: [],
    };

    expect(normalize([entry])[0]?.version).toBe("unknown");
  });

  it("carries hasGameCategory through when true", () => {
    const entry: AppCenterCacheEntry = {
      id: "com.example.Game",
      name: "Game",
      summary: "A game",
      hasGameCategory: true,
      categories: ["Game"],
    };

    expect(normalize([entry])[0]?.hasGameCategory).toBe(true);
  });

  it("carries categories through unchanged", () => {
    const entry: AppCenterCacheEntry = {
      id: "com.example.App",
      name: "App",
      summary: "An app",
      hasGameCategory: false,
      categories: ["Office", "TextEditor"],
    };

    expect(normalize([entry])[0]?.categories).toEqual(["Office", "TextEditor"]);
  });
});
