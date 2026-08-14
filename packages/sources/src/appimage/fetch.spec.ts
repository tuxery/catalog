import { describe, expect, it } from "vitest";
import { mapItems } from "./fetch";

describe("mapItems", () => {
  it("maps an item with a GitHub link to a cache entry", () => {
    const items = [
      {
        name: "Krita",
        description: "Digital painting, illustration, and animation",
        links: [
          { type: "GitHub", url: "KDE/krita" },
          { type: "Download", url: "https://github.com/KDE/krita/releases" },
        ],
        icons: ["Krita/icons/512x512/krita.png"],
      },
    ];

    expect(mapItems(items)).toEqual([
      {
        name: "Krita",
        description: "Digital painting, illustration, and animation",
        repo: "KDE/krita",
        iconFilename: "krita.png",
        homepage: "https://github.com/KDE/krita",
      },
    ]);
  });

  it("drops items with no GitHub link", () => {
    const items = [
      {
        name: "No Repo",
        description: "Nothing to link to",
        links: [{ type: "Download", url: "x" }],
      },
      { name: "Null Links", description: "links is null in the real feed sometimes", links: null },
    ];

    expect(mapItems(items)).toEqual([]);
  });

  it("drops items with no name", () => {
    expect(mapItems([{ links: [{ type: "GitHub", url: "owner/repo" }] }])).toEqual([]);
  });

  it("falls back to an empty description and no icon when absent", () => {
    const items = [{ name: "Bare", links: [{ type: "GitHub", url: "owner/bare" }] }];

    expect(mapItems(items)).toEqual([
      {
        name: "Bare",
        description: "",
        repo: "owner/bare",
        iconFilename: undefined,
        homepage: "https://github.com/owner/bare",
      },
    ]);
  });
});
