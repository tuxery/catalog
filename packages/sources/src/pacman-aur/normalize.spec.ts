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

  it("reads a release-channel word from its name, even combined with a build-variant suffix", () => {
    // Real bug, found live: brave-origin-beta-bin/brave-origin-nightly-bin
    // never unioned with the stable brave-origin-bin build at all — the
    // channel word wasn't recognized, only the trailing -bin was, so
    // stripping just "-bin" left "brave-origin-beta"/"brave-origin-nightly",
    // neither of which matched anything.
    const betaBin: AurCacheEntry = {
      name: "brave-origin-beta-bin",
      description: "The minimalist browser from the makers of Brave (beta binary release).",
      version: "1.94.112-1",
      homepage: "https://brave.com/origin/download-beta",
    };
    expect(normalize([betaBin])[0]?.channel).toBe("beta");

    const nightly: AurCacheEntry = {
      name: "ferdium-nightly",
      description: "All your services in one place",
      version: "7.0.0-1",
      homepage: "https://ferdium.org",
    };
    expect(normalize([nightly])[0]?.channel).toBe("nightly");
  });

  it("does not treat a -dev suffix as a release channel — collides with the unrelated Debian-style headers-package meaning", () => {
    const entry: AurCacheEntry = {
      name: "kodi-git-dev",
      description: "Development files for kodi-git",
      version: "22.0.0-1",
      homepage: "https://kodi.tv",
    };

    expect(normalize([entry])[0]?.channel).toBeUndefined();
  });
});
