import { describe, expect, it } from "vitest";
import { toCacheEntries } from "./fetch";
import { normalize } from "./normalize";
import type { PacmanArchAppstreamCacheEntry } from "./types";

const FIXTURE: PacmanArchAppstreamCacheEntry[] = [
  {
    id: "org.example.App.desktop",
    pkgname: "example-app",
    source_pkgname: "example",
    name: "Example App",
    summary: "An example application",
    version: "1.2.3",
    iconFilename: "example-app.png",
    remoteIconUrl: "https://example.com/icon.png",
    homepage: "https://example.com",
    hasGameCategory: false,
    categories: ["Development", "IDE"],
    license: "MIT",
    developer: "Example Team",
    longDescription: "Long description here.",
    screenshots: ["https://example.com/shot.png"],
    languages: ["en"],
    changelog: "Fixed bugs.",
    lastUpdated: "2026-09-03T00:00:00.000Z",
  },
];

describe("toCacheEntries", () => {
  it("keeps only components with a pkgname", () => {
    const entries = toCacheEntries([
      {
        id: "keep.desktop",
        name: "Keep",
        summary: "keep me",
        hasGameCategory: false,
        categories: [],
        screenshots: [],
        pkgname: "keep",
      },
      {
        id: "drop.desktop",
        name: "Drop",
        summary: "drop me",
        hasGameCategory: false,
        categories: [],
        screenshots: [],
      },
    ]);

    expect(entries.map((e) => e.pkgname)).toEqual(["keep"]);
  });
});

describe("normalize", () => {
  it("uses pkgname as appId and the human name as display name", () => {
    const packages = normalize(FIXTURE);

    expect(packages).toHaveLength(1);
    expect(packages[0]).toMatchObject({
      source: "pacman-arch-appstream",
      name: "Example App",
      description: "An example application",
      appId: "example-app",
      homepage: "https://example.com",
      hasGameCategory: false,
      categories: ["Development", "IDE"],
      license: "MIT",
      developer: "Example Team",
      longDescription: "Long description here.",
      screenshots: ["https://example.com/shot.png"],
    });
  });
});
