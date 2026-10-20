import { describe, expect, it } from "vitest";
import { isApp, normalize } from "./normalize";
import type { AppImageHubCacheEntry } from "./types";

const entry = (extra: Partial<AppImageHubCacheEntry>): AppImageHubCacheEntry => ({
  id: "1",
  name: "Mpz",
  typename: "Audioplayers",
  summary: "A folder player",
  version: "2.1.0",
  tags: ["app", "appimage", "x86-64"],
  detailpage: "https://www.appimagehub.com/p/1",
  ...extra,
});

describe("appimagehub normalize", () => {
  it("points the package at its AppImageHub page and maps the store category", () => {
    const [pkg] = normalize([entry({ tags: ["appimage", "gplv3", "original-product"] })]);
    expect(pkg).toMatchObject({
      source: "appimagehub",
      name: "Mpz",
      description: "A folder player",
      version: "2.1.0",
      appId: "1",
      homepage: "https://www.appimagehub.com/p/1",
      categories: ["AudioVideo", "Audio", "Player"],
      hasGameCategory: false,
      license: "GPL-3.0-only",
      provenance: "upstream",
    });
  });

  it("marks a game, and leaves an unknown store category without categories", () => {
    const [game, other] = normalize([
      entry({ typename: "Tactics & Strategy" }),
      entry({ typename: "Something New" }),
    ]);
    expect(game?.hasGameCategory).toBe(true);
    expect(other?.categories).toBeUndefined();
  });

  it("reads the declared release type as a risk, unless the name gives one", () => {
    const [beta, git, nightly] = normalize([
      entry({ tags: ["appimage", "release-beta"] }),
      entry({ tags: ["appimage", "release-git"] }),
      entry({ name: "Tool Nightly", tags: ["appimage", "release-git"] }),
    ]);
    expect(beta?.risk).toBe("beta");
    expect(git?.risk).toBe("git");
    expect(nightly?.risk).toBe("nightly");
  });

  it("leaves out wallpapers, components and anything that isn't an AppImage", () => {
    expect(isApp(entry({ typename: "Landscapes" }))).toBe(false);
    expect(isApp(entry({ typename: "Qt Widgets" }))).toBe(false);
    expect(isApp(entry({ tags: ["app"] }))).toBe(false);
    expect(isApp(entry({}))).toBe(true);
  });
});
