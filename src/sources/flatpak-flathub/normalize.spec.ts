import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { FlathubCacheEntry } from "./types";

describe("flathub normalize", () => {
  it("maps a cache entry to a SourcedPackage", () => {
    const entry: FlathubCacheEntry = {
      id: "org.mozilla.firefox",
      name: "Firefox",
      summary: "Fast, private, and safe web browser",
      version: "128.0",
      iconFilename: "org.mozilla.firefox.png",
      iconUrl: "https://dl.flathub.org/media/org/mozilla/firefox/icons/128x128/icon.png",
      homepage: "https://www.mozilla.org/firefox/",
      hasGameCategory: false,
      categories: ["Network", "WebBrowser"],
      license: "MPL-2.0",
      developer: "Mozilla",
      longDescription: "Firefox is a free and open source web browser.",
      screenshots: ["https://dl.flathub.org/media/org/mozilla/firefox/screenshots/1.png"],
    };

    expect(normalize([entry])).toEqual([
      {
        source: "flatpak-flathub",
        name: "Firefox",
        description: "Fast, private, and safe web browser",
        version: "128.0",
        appId: "org.mozilla.firefox",
        iconFilename: "org.mozilla.firefox.png",
        iconUrl: "https://dl.flathub.org/media/org/mozilla/firefox/icons/128x128/icon.png",
        homepage: "https://www.mozilla.org/firefox/",
        hasGameCategory: false,
        categories: ["Network", "WebBrowser"],
        license: "MPL-2.0",
        developer: "Mozilla",
        longDescription: "Firefox is a free and open source web browser.",
        screenshots: ["https://dl.flathub.org/media/org/mozilla/firefox/screenshots/1.png"],
      },
    ]);
  });

  it('falls back to "unknown" when the version is missing', () => {
    const entry: FlathubCacheEntry = {
      id: "org.example.App",
      name: "App",
      summary: "An app",
      hasGameCategory: false,
      categories: [],
      screenshots: [],
    };

    expect(normalize([entry])[0]?.version).toBe("unknown");
  });

  it("carries languages and changelog through unchanged", () => {
    const entry: FlathubCacheEntry = {
      id: "org.example.App",
      name: "App",
      summary: "An app",
      hasGameCategory: false,
      categories: [],
      screenshots: [],
      languages: ["en_US", "fr"],
      changelog: "Fixed a crash on startup.",
    };

    const result = normalize([entry])[0];
    expect(result?.languages).toEqual(["en_US", "fr"]);
    expect(result?.changelog).toBe("Fixed a crash on startup.");
  });

  it("carries lastUpdated through unchanged", () => {
    const entry: FlathubCacheEntry = {
      id: "org.example.App",
      name: "App",
      summary: "An app",
      hasGameCategory: false,
      categories: [],
      screenshots: [],
      lastUpdated: "2026-08-10T00:00:00.000Z",
    };

    expect(normalize([entry])[0]?.lastUpdated).toBe("2026-08-10T00:00:00.000Z");
  });

  it("carries hasGameCategory through when true", () => {
    const entry: FlathubCacheEntry = {
      id: "org.example.Game",
      name: "Game",
      summary: "A game",
      hasGameCategory: true,
      categories: ["Game"],
      screenshots: [],
    };

    expect(normalize([entry])[0]?.hasGameCategory).toBe(true);
  });

  it("carries categories through unchanged", () => {
    const entry: FlathubCacheEntry = {
      id: "org.example.App",
      name: "App",
      summary: "An app",
      hasGameCategory: false,
      categories: ["Utility", "Development"],
      screenshots: [],
    };

    expect(normalize([entry])[0]?.categories).toEqual(["Utility", "Development"]);
  });

  it("leaves screenshots undefined (not an empty array) when there are none", () => {
    const entry: FlathubCacheEntry = {
      id: "org.example.App",
      name: "App",
      summary: "An app",
      hasGameCategory: false,
      categories: [],
      screenshots: [],
    };

    expect(normalize([entry])[0]?.screenshots).toBeUndefined();
  });

  it("carries license, developer, and longDescription through unchanged", () => {
    const entry: FlathubCacheEntry = {
      id: "org.example.App",
      name: "App",
      summary: "An app",
      hasGameCategory: false,
      categories: [],
      screenshots: [],
      license: "GPL-3.0+",
      developer: "Example Team",
      longDescription: "A longer description.",
    };

    const [pkg] = normalize([entry]);
    expect(pkg?.license).toBe("GPL-3.0+");
    expect(pkg?.developer).toBe("Example Team");
    expect(pkg?.longDescription).toBe("A longer description.");
  });
});
