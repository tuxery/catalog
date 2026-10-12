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

describe("normalize with a channel-map", () => {
  it("emits one package per channel, with its own track, risk and version", () => {
    const result = normalize([
      {
        name: "postman",
        title: "Postman",
        summary: "",
        version: "11.71.7",
        channel: "v11/stable",
        channels: [
          { channel: "stable", version: "11.71.7" },
          { channel: "v10/stable", version: "10.24.0" },
          { channel: "edge", version: "11.72.0" },
        ],
      },
    ]);

    expect(
      result.map(({ appId, version, track, risk }) => ({
        appId,
        version,
        track,
        risk,
      })),
    ).toEqual([
      {
        appId: "postman",
        version: "11.71.7",
        track: undefined,
        risk: undefined,
      },
      { appId: "postman", version: "10.24.0", track: "v10", risk: undefined },
      {
        appId: "postman",
        version: "11.72.0",
        track: undefined,
        risk: "nightly",
      },
    ]);
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

  it("carries the rich fields and dates each channel by its own release", () => {
    const entry: SnapcraftCacheEntry = {
      name: "vlc",
      title: "VLC",
      summary: "The ultimate media player",
      version: "3.0.24-rc1",
      channel: "stable",
      channels: [
        {
          channel: "stable",
          version: "3.0.24-rc1",
          releasedAt: "2026-09-22T13:42:44.025641+00:00",
        },
        { channel: "edge", version: "4.0.0-dev", releasedAt: "2026-10-11T02:00:00.000000+00:00" },
      ],
      longDescription: "VLC is a free and open source cross-platform multimedia player.",
      license: "GPL-2.0+",
      publisher: "VideoLAN",
      publisherVerified: true,
      screenshots: ["https://dashboard.snapcraft.io/shot-1.jpg"],
      links: { bugtracker: "https://code.videolan.org/videolan/vlc/-/work_items" },
    };

    const [stable, edge] = normalize([entry]);
    expect(stable).toMatchObject({
      longDescription: entry.longDescription,
      license: "GPL-2.0+",
      publisher: "VideoLAN",
      publisherVerified: true,
      screenshots: entry.screenshots,
      links: entry.links,
      builtAt: "2026-09-22T13:42:44.025641+00:00",
    });
    expect(edge?.builtAt).toBe("2026-10-11T02:00:00.000000+00:00");
    expect(stable?.lastUpdated).toBeUndefined();
  });
});
