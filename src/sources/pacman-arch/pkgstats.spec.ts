import { describe, expect, it } from "vitest";
import { parsePkgstats } from "./pkgstats";

// Real rows of pkgstats.archlinux.de/api/packages, 2026-10-12.
describe("parsePkgstats", () => {
  it("maps each package to the number of users reporting it", () => {
    expect(
      parsePkgstats({
        total: 34274,
        packagePopularities: [
          { name: "acl", count: 31956 },
          { name: "firefox", count: 22092 },
          { name: "qt5-quicktimeline", count: 245 },
        ],
      }),
    ).toEqual(
      new Map([
        ["acl", 31956],
        ["firefox", 22092],
        ["qt5-quicktimeline", 245],
      ]),
    );
  });

  it("skips rows without a name or count, and an empty page", () => {
    expect(
      parsePkgstats({ packagePopularities: [{ count: 3 }, { name: "x", count: 0 }] }).size,
    ).toBe(0);
    expect(parsePkgstats({}).size).toBe(0);
  });
});
