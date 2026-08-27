import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { RpmFusionCacheEntry } from "./types";

describe("rpm-rpmfusion normalize", () => {
  it("maps a cache entry to a SourcedPackage", () => {
    const entry: RpmFusionCacheEntry = {
      name: "stepmania",
      summary: "Advanced cross-platform rhythm game",
      version: "5.1.0",
      homepage: "https://www.stepmania.com/",
      group: "Amusements/Games",
      hasDesktopFile: true,
    };

    expect(normalize([entry])).toEqual([
      {
        source: "rpm-rpmfusion",
        name: "stepmania",
        description: "Advanced cross-platform rhythm game",
        version: "5.1.0",
        appId: "stepmania",
        homepage: "https://www.stepmania.com/",
        section: "Amusements/Games",
        hasDesktopFile: true,
      },
    ]);
  });

  it("leaves section undefined when the entry has no group", () => {
    const entry: RpmFusionCacheEntry = {
      name: "libbluray",
      summary: "Library",
      version: "1.3.4",
      hasDesktopFile: false,
    };

    expect(normalize([entry])[0]?.section).toBeUndefined();
  });
});
