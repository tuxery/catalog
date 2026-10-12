import { describe, expect, it } from "vitest";
import { mapPlist, voidLicense } from "./fetch";

const SAMPLE_PACKAGES = {
  "0ad": {
    architecture: "x86_64",
    homepage: "https://play0ad.com",
    installed_size: 11756502,
    license: "GPL-2.0-or-later, CC-BY-SA-3.0, MPL-2.0, MIT",
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
        license: "GPL-2.0-or-later AND CC-BY-SA-3.0 AND MPL-2.0 AND MIT",
        installedSizeBytes: 11756502,
        repo: "main",
      },
      {
        name: "bare-pkg",
        short_desc: "",
        pkgver: "bare-pkg-1.0_1",
        homepage: undefined,
        license: undefined,
        installedSizeBytes: undefined,
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

describe("voidLicense", () => {
  it("AND-joins the comma list and keeps an expression as is", () => {
    expect(voidLicense("MIT, Apache-2.0")).toBe("MIT AND Apache-2.0");
    expect(voidLicense("MIT OR Apache-2.0")).toBe("MIT OR Apache-2.0");
  });

  it("is undefined when blank or not text", () => {
    expect(voidLicense(" , ")).toBeUndefined();
    expect(voidLicense(undefined)).toBeUndefined();
  });
});
