import { describe, expect, it } from "vitest";
import { mapPlist } from "./fetch";

const SAMPLE_PACKAGES = {
  "0ad": {
    architecture: "x86_64",
    homepage: "https://play0ad.com",
    pkgver: "0ad-0.27.1_6",
    short_desc: "Historically-based real-time strategy game",
  },
  "bare-pkg": {
    pkgver: "bare-pkg-1.0_1",
  },
};

describe("mapPlist", () => {
  it("maps every package, stamping the given repo", () => {
    expect(mapPlist(SAMPLE_PACKAGES, "main")).toEqual([
      {
        name: "0ad",
        short_desc: "Historically-based real-time strategy game",
        pkgver: "0ad-0.27.1_6",
        homepage: "https://play0ad.com",
        repo: "main",
      },
      {
        name: "bare-pkg",
        short_desc: "",
        pkgver: "bare-pkg-1.0_1",
        homepage: undefined,
        repo: "main",
      },
    ]);
  });

  it("falls back to the package name when pkgver is missing", () => {
    expect(mapPlist({ "no-pkgver": {} }, "nonfree")[0]?.pkgver).toBe("no-pkgver");
  });

  it("returns an empty array for no packages", () => {
    expect(mapPlist({}, "multilib")).toEqual([]);
  });
});
