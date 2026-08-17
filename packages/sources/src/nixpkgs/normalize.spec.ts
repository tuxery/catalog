import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { NixpkgsCacheEntry } from "./types";

describe("nixpkgs normalize", () => {
  it("maps a cache entry to a SourcedPackage, using the attr path as appId", () => {
    const entry: NixpkgsCacheEntry = {
      attrPath: "kdePackages.akregator",
      name: "akregator",
      description: "RSS Feed Reader",
      version: "24.12.0",
      homepage: "https://apps.kde.org/akregator/",
      prefix: "kdePackages",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "nixpkgs",
        name: "akregator",
        description: "RSS Feed Reader",
        version: "24.12.0",
        appId: "kdePackages.akregator",
        homepage: "https://apps.kde.org/akregator/",
        section: "kdePackages",
      },
    ]);
  });

  it("leaves section undefined for a top-level attribute with no prefix", () => {
    const entry: NixpkgsCacheEntry = {
      attrPath: "firefox",
      name: "firefox",
      description: "",
      version: "140.0",
    };

    expect(normalize([entry])[0]?.section).toBeUndefined();
  });
});
