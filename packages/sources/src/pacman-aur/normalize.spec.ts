import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { AurCacheEntry } from "./types";

describe("aur normalize", () => {
  it("maps a cache entry to a SourcedPackage, using the name as appId", () => {
    const entry: AurCacheEntry = {
      name: "python-django",
      description: "High-level Python web framework",
      version: "5.1-1",
      homepage: "https://www.djangoproject.com/",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "pacman-aur",
        name: "python-django",
        description: "High-level Python web framework",
        version: "5.1-1",
        appId: "python-django",
        homepage: "https://www.djangoproject.com/",
      },
    ]);
  });

  it("reads a VCS-suffix package's channel from its name", () => {
    const entry: AurCacheEntry = {
      name: "0xtools-git",
      description: "0x.Tools: X-Ray vision for Linux systems",
      version: "1.0.0.r5.g1234567-1",
      homepage: "https://github.com/tanelpoder/0xtools",
    };

    expect(normalize([entry])[0]?.channel).toBe("git");
  });

  it("reads a prebuilt-binary package's channel from its name", () => {
    const entry: AurCacheEntry = {
      name: "zen-browser-bin",
      description:
        "Official package for Zen, a privacy-focused, feature packed Firefox-based browser",
      version: "1.21.15-1",
      homepage: "https://zen-browser.app",
    };

    expect(normalize([entry])[0]?.channel).toBe("bin");
  });
});
