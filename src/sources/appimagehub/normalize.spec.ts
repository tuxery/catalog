import { describe, expect, it } from "vitest";
import {
  descriptionExcerpt,
  EXCERPT_MAX,
  iconRendering,
  isApp,
  normalize,
  shortDescription,
} from "./normalize";
import type { AppImageHubCacheEntry } from "./types";

const entry = (extra: Partial<AppImageHubCacheEntry>): AppImageHubCacheEntry => ({
  id: "1",
  name: "Example Player",
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
      name: "Example Player",
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

describe("appimagehub images and descriptions", () => {
  it("asks for the icon at 128x128 from the first preview, and keeps the rest as screenshots", () => {
    const [pkg] = normalize([
      entry({
        previewPics: [
          "https://images.pling.com/cache/770x540-4/img/a.png",
          "https://images.pling.com/cache/770x540-4/img/b.png",
        ],
      }),
    ]);
    expect(pkg?.iconUrl).toBe("https://images.pling.com/cache/128x128-4/img/a.png");
    expect(pkg?.screenshots).toEqual(["https://images.pling.com/cache/770x540-4/img/b.png"]);
  });

  it("uses no icon when the URL has no size segment to rewrite", () => {
    expect(iconRendering("https://example.org/a.png")).toBeUndefined();
  });

  it("replaces a summary cut at ~40 characters with the description's first sentence", () => {
    const cut = entry({
      summary: "A music player that plays whole folders",
      descriptionText:
        "A music player that plays whole folders and playlists. It also has a tray icon.\n\nMore.",
    });
    expect(shortDescription(cut)).toBe("A music player that plays whole folders and playlists.");
    expect(shortDescription(entry({ descriptionText: "Something else entirely." }))).toBe(
      "A folder player",
    );
  });

  it("keeps the full text as the long description, for the app's own page", () => {
    const [pkg] = normalize([entry({ descriptionText: "First.\n\nSecond." })]);
    expect(pkg?.longDescription).toBe("First.\n\nSecond.");
  });

  it("cuts the card excerpt to the first paragraph, at most 300 characters, at a word", () => {
    expect(descriptionExcerpt("First.\n\nSecond.")).toBe("First.");
    const excerpt = descriptionExcerpt("word ".repeat(100)) ?? "";
    expect(excerpt.length).toBeLessThanOrEqual(EXCERPT_MAX);
    expect(excerpt.endsWith("word…")).toBe(true);
  });
});
