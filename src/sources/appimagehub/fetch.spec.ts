import { describe, expect, it } from "vitest";
import { mapItems, sweptRecently } from "./fetch";

describe("appimagehub mapItems", () => {
  it("keeps what the cache needs, tags as a list, and no image or download URL", () => {
    const [entry] = mapItems([
      {
        id: 2367450,
        name: " mpz - music player ",
        typename: "Audioplayers",
        summary: "A folder player",
        version: "",
        download_version1: "2.1.0",
        tags: "software, gplv3,app,appimage,x86-64",
        detailpage: "https://www.appimagehub.com/p/2367450",
        changed: "2026-10-18T18:41:26+00:00",
      },
    ]);
    expect(entry).toEqual({
      id: "2367450",
      name: "mpz - music player",
      typename: "Audioplayers",
      summary: "A folder player",
      version: "2.1.0",
      tags: ["software", "gplv3", "app", "appimage", "x86-64"],
      detailpage: "https://www.appimagehub.com/p/2367450",
      changed: "2026-10-18T18:41:26+00:00",
    });
  });

  it("drops an item without an id, a name or a detail page", () => {
    expect(
      mapItems([
        { name: "No id", detailpage: "https://www.appimagehub.com/p/1" },
        { id: 2, detailpage: "https://www.appimagehub.com/p/2" },
        { id: 3, name: "No page" },
      ]),
    ).toEqual([]);
  });
});

describe("sweptRecently", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("skips a sweep less than six days after the last one", () => {
    expect(sweptRecently("2026-10-18T09:00:00Z", now)).toBe(true);
  });

  it("allows one a week later, or with no previous sweep", () => {
    expect(sweptRecently("2026-10-13T09:00:00Z", now)).toBe(false);
    expect(sweptRecently(undefined, now)).toBe(false);
  });
});
