import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { AppImageCacheEntry } from "./types";

describe("appimage normalize", () => {
  it("maps a cache entry to a SourcedPackage", () => {
    const entry: AppImageCacheEntry = {
      name: "krita",
      description: "Digital painting, illustration, and animation",
      repo: "KDE/krita",
      version: "5.2.2",
      iconFilename: "krita.png",
      homepage: "https://krita.org",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "appimage",
        name: "krita",
        description: "Digital painting, illustration, and animation",
        version: "5.2.2",
        appId: "KDE/krita",
        iconFilename: "krita.png",
        homepage: "https://krita.org",
      },
    ]);
  });

  it('falls back to "unknown" when the version is missing', () => {
    const entry: AppImageCacheEntry = { name: "app", description: "An app", repo: "owner/app" };

    expect(normalize([entry])[0]?.version).toBe("unknown");
  });
});
