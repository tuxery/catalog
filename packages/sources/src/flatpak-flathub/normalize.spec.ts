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
      homepage: "https://www.mozilla.org/firefox/",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "flatpak-flathub",
        name: "Firefox",
        description: "Fast, private, and safe web browser",
        version: "128.0",
        appId: "org.mozilla.firefox",
        iconFilename: "org.mozilla.firefox.png",
        homepage: "https://www.mozilla.org/firefox/",
      },
    ]);
  });

  it('falls back to "unknown" when the version is missing', () => {
    const entry: FlathubCacheEntry = { id: "org.example.App", name: "App", summary: "An app" };

    expect(normalize([entry])[0]?.version).toBe("unknown");
  });
});
