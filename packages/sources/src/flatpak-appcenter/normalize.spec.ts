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
      iconUrl: "https://flatpak.elementary.io/repo/appstream/x86_64/icons/128x128/akira.png",
      homepage: "https://akiraux.org",
      hasGameCategory: false,
      categories: ["Graphics"],
      license: "GPL-3.0+",
      developer: "Alessandro Castellani",
      longDescription: "Akira is a native Linux app for UI and UX design.",
      screenshots: ["https://raw.githubusercontent.com/akiraux/akira/master/screenshot-1.png"],
    };

    expect(normalize([entry])).toEqual([
      {
        source: "flatpak-appcenter",
        name: "Akira",
        description: "The Linux Design Tool",
        version: "0.0.16",
        appId: "com.github.akiraux.akira",
        iconFilename: "com.github.akiraux.akira.png",
        iconUrl: "https://flatpak.elementary.io/repo/appstream/x86_64/icons/128x128/akira.png",
        homepage: "https://akiraux.org",
        hasGameCategory: false,
        categories: ["Graphics"],
        license: "GPL-3.0+",
        developer: "Alessandro Castellani",
        longDescription: "Akira is a native Linux app for UI and UX design.",
        screenshots: ["https://raw.githubusercontent.com/akiraux/akira/master/screenshot-1.png"],
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
      screenshots: [],
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
      screenshots: [],
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
      screenshots: [],
    };

    expect(normalize([entry])[0]?.categories).toEqual(["Office", "TextEditor"]);
  });

  it("leaves screenshots undefined (not an empty array) when there are none", () => {
    const entry: AppCenterCacheEntry = {
      id: "com.example.App",
      name: "App",
      summary: "An app",
      hasGameCategory: false,
      categories: [],
      screenshots: [],
    };

    expect(normalize([entry])[0]?.screenshots).toBeUndefined();
  });
});
