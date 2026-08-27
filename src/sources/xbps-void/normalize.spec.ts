import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { VoidCacheEntry } from "./types";

describe("void normalize", () => {
  it("maps a cache entry to a SourcedPackage, extracting the version from pkgver", () => {
    const entry: VoidCacheEntry = {
      name: "0ad",
      short_desc: "Historically-based real-time strategy game",
      pkgver: "0ad-0.27.1_6",
      homepage: "https://play0ad.com",
      repo: "main",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "xbps-void",
        name: "0ad",
        description: "Historically-based real-time strategy game",
        version: "0.27.1_6",
        appId: "0ad",
        homepage: "https://play0ad.com",
      },
    ]);
  });

  it("falls back to the raw pkgver when it doesn't start with the package name", () => {
    const entry: VoidCacheEntry = {
      name: "weird-pkg",
      short_desc: "",
      pkgver: "unexpected-format",
      repo: "main",
    };

    expect(normalize([entry])[0]?.version).toBe("unexpected-format");
  });
});
