import { describe, expect, it } from "vitest";
import { normalize, splitSnapChannel } from "./normalize";
import type { SnapcraftCacheEntry } from "./types";

describe("snapcraft normalize", () => {
  it("maps a cache entry to a SourcedPackage", () => {
    const entry: SnapcraftCacheEntry = {
      name: "spotify",
      title: "Spotify",
      summary: "Stream music, podcasts, and playlists",
      version: "1.2.3",
      channel: "stable",
      iconUrl: "https://dashboard.snapcraft.io/icons/spotify.png",
      website: "https://spotify.com",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "snap-snapcraft",
        name: "Spotify",
        description: "Stream music, podcasts, and playlists",
        version: "1.2.3",
        appId: "spotify",
        iconFilename: "spotify.png",
        iconUrl: "https://dashboard.snapcraft.io/icons/spotify.png",
        homepage: "https://spotify.com",
      },
    ]);
  });

  it("leaves iconFilename undefined when iconUrl is missing", () => {
    const entry: SnapcraftCacheEntry = {
      name: "app",
      title: "App",
      summary: "An app",
      version: "1.0.0",
      channel: "stable",
    };

    expect(normalize([entry])[0]?.iconFilename).toBeUndefined();
  });

  it("keeps the full iconUrl, unlike iconFilename which is trimmed down to just the last path segment", () => {
    const entry: SnapcraftCacheEntry = {
      name: "spotify",
      title: "Spotify",
      summary: "Stream music, podcasts, and playlists",
      version: "1.2.3",
      channel: "stable",
      iconUrl: "https://dashboard.snapcraft.io/icons/spotify.png",
    };

    expect(normalize([entry])[0]?.iconUrl).toBe("https://dashboard.snapcraft.io/icons/spotify.png");
  });

  it("carries categories and hasGameCategory through unchanged — already translated by fetch.ts's applyCategories", () => {
    const entry: SnapcraftCacheEntry = {
      name: "0ad",
      title: "0 A.D.",
      summary: "Real-time strategy game of ancient warfare",
      version: "unknown",
      channel: "stable",
      hasGameCategory: true,
    };

    const result = normalize([entry])[0];
    expect(result?.hasGameCategory).toBe(true);
    expect(result?.categories).toBeUndefined();
  });
});

describe("splitSnapChannel", () => {
  it("reads a bare risk, mapping edge to nightly and stable to the default", () => {
    expect(splitSnapChannel("stable")).toEqual({});
    expect(splitSnapChannel("candidate")).toEqual({ risk: "candidate" });
    expect(splitSnapChannel("edge")).toEqual({ risk: "nightly" });
  });

  it("reads a track, treating latest as the default track", () => {
    expect(splitSnapChannel("v11/stable")).toEqual({ track: "v11" });
    expect(splitSnapChannel("22/beta")).toEqual({ track: "22", risk: "beta" });
    expect(splitSnapChannel("latest/edge")).toEqual({ risk: "nightly" });
  });

  it("ignores a trailing branch", () => {
    expect(splitSnapChannel("22/stable/hotfix")).toEqual({ track: "22" });
  });
});
