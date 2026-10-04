import { describe, expect, it } from "vitest";
import { loadSeed, pickLatest } from "./fetch";

const index = `Package: signal-desktop
Version: 8.29.0
Description: Private messenger

Package: signal-desktop
Version: 8.29.0~beta.1
Description: Private messenger (beta build)

Package: signal-desktop
Version: 8.9.0
Description: Private messenger (older)

Package: signal-desktop-beta
Version: 9.0.0
Description: Beta channel
`;

describe("pickLatest", () => {
  it("picks the highest Debian version of the package, not the last or the lexically greatest", () => {
    expect(pickLatest(index, "signal-desktop")).toEqual({
      description: "Private messenger",
      version: "8.29.0",
    });
  });

  it("prefers a release over its own ~pre-release", () => {
    const text = "Package: x\nVersion: 2.0~rc1\n\nPackage: x\nVersion: 2.0\n";
    expect(pickLatest(text, "x")?.version).toBe("2.0");
  });

  it("is undefined for a package the index doesn't carry", () => {
    expect(pickLatest(index, "signal")).toBeUndefined();
  });
});

describe("vendors.ndjson", () => {
  const seed = loadSeed();

  it("lists each package once per vendor, over https, as a stable channel package", () => {
    expect(seed.length).toBeGreaterThan(0);
    const keys = seed.map((entry) => `${entry.vendor}/${entry.package}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of seed) {
      expect(entry.indexUrl).toMatch(/^https:\/\/.+\/Packages$/);
      expect(entry.homepage).toMatch(/^https:\/\//);
      expect(entry.package).not.toMatch(/(beta|alpha|dev|canary|unstable|snapshot|insiders)/);
    }
  });
});
