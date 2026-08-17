import { describe, expect, it } from "vitest";
import { dedupeByNewest, isDeepinPackage, parsePackages } from "./fetch";

describe("isDeepinPackage", () => {
  it("matches dde-/deepin-prefixed names", () => {
    expect(isDeepinPackage("dde-calendar")).toBe(true);
    expect(isDeepinPackage("deepin-album")).toBe(true);
  });

  it("does not match unrelated packages", () => {
    expect(isDeepinPackage("firefox")).toBe(false);
    expect(isDeepinPackage("libqt5core5a")).toBe(false);
  });
});

describe("dedupeByNewest", () => {
  it("keeps only the first entry per name", () => {
    const entries = [
      { name: "dde-calendar", version: "5.9.14-1" },
      { name: "dde-calendar", version: "5.9.10-1" },
      { name: "dde-dock", version: "5.5.1-1" },
    ];

    expect(dedupeByNewest(entries)).toEqual([
      { name: "dde-calendar", version: "5.9.14-1" },
      { name: "dde-dock", version: "5.5.1-1" },
    ]);
  });
});

const FIXTURE = `Package: dde-calendar
Version: 5.9.14-1
Section: utils
Homepage: https://github.com/linuxdeepin/dde-calendar
Description: Calendar is a smart daily planner
 A calendar app for DDE.

Package: dde-calendar
Version: 5.9.10-1
Section: utils
Description: Calendar is a smart daily planner (older)
 An older build.

Package: firefox
Version: 153.0.4
Section: web
Description: Safe and easy web browser from Mozilla
 Firefox for Deepin.
`;

describe("parsePackages", () => {
  const entries = parsePackages(FIXTURE);

  it("keeps only Deepin-authored packages, deduplicated to the newest version", () => {
    expect(entries.map((entry) => entry.name)).toEqual(["dde-calendar"]);
    expect(entries[0]?.version).toBe("5.9.14-1");
  });

  it("extracts description, homepage, section", () => {
    expect(entries[0]).toEqual({
      name: "dde-calendar",
      description: "Calendar is a smart daily planner",
      version: "5.9.14-1",
      homepage: "https://github.com/linuxdeepin/dde-calendar",
      section: "utils",
    });
  });
});
