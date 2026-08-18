import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
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
        channel: "stable",
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
});
