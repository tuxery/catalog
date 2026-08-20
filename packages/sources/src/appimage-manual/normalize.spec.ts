import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { ManualAppImageCacheEntry } from "./types";

describe("appimage-manual normalize", () => {
  it("maps a cache entry to a SourcedPackage", () => {
    const entry: ManualAppImageCacheEntry = {
      name: "pCloud Drive",
      description: "Official pCloud desktop client.",
      homepage: "https://www.pcloud.com/how-to-install-pcloud-drive-linux.html",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "appimage-manual",
        name: "pCloud Drive",
        description: "Official pCloud desktop client.",
        version: "unknown",
        appId: "pCloud Drive",
        homepage: "https://www.pcloud.com/how-to-install-pcloud-drive-linux.html",
      },
    ]);
  });

  it("always sets version to unknown — no release feed exists for this source", () => {
    const entry: ManualAppImageCacheEntry = {
      name: "App",
      description: "An app",
      homepage: "https://example.com",
    };

    expect(normalize([entry])[0]?.version).toBe("unknown");
  });
});
