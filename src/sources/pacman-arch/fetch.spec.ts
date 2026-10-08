import { describe, expect, it } from "vitest";
import { mapDescFiles, parseDescValues } from "./fetch";

const DESC_FIXTURE = `%FILENAME%
0ad-0.28.0-3-x86_64.pkg.tar.zst

%NAME%
0ad

%VERSION%
0.28.0-3

%DESC%
Cross-platform, 3D and historically-based real-time strategy game

%URL%
http://play0ad.com/

%LICENSE%
GPL-2.0-or-later

%ARCH%
x86_64

%DEPENDS%
0ad-data=0.28.0
binutils
boost-libs

%PROVIDES%
0ad

%CONFLICTS%
0ad-git
`;

describe("parseDescValues", () => {
  it("extracts single-line fields", () => {
    const fields = parseDescValues(DESC_FIXTURE);

    expect(fields.NAME).toEqual(["0ad"]);
    expect(fields.VERSION).toEqual(["0.28.0-3"]);
    expect(fields.URL).toEqual(["http://play0ad.com/"]);
  });

  it("keeps every line of a list field", () => {
    expect(parseDescValues(DESC_FIXTURE).DEPENDS).toEqual([
      "0ad-data=0.28.0",
      "binutils",
      "boost-libs",
    ]);
  });

  it("returns an empty object for content with no fields", () => {
    expect(parseDescValues("")).toEqual({});
  });
});

describe("mapDescFiles", () => {
  it("maps parsed fields to a cache entry, stamping the given repo", () => {
    expect(mapDescFiles([parseDescValues(DESC_FIXTURE)], "extra")).toEqual([
      {
        name: "0ad",
        description: "Cross-platform, 3D and historically-based real-time strategy game",
        version: "0.28.0-3",
        homepage: "http://play0ad.com/",
        repo: "extra",
        formal: { conflicts: ["0ad-git"], depends: ["0ad-data", "binutils", "boost-libs"] },
      },
    ]);
  });

  it("drops entries with no NAME", () => {
    expect(mapDescFiles([{ DESC: ["orphaned"] }], "core")).toEqual([]);
  });

  it("falls back gracefully when optional fields are missing", () => {
    expect(mapDescFiles([{ NAME: ["bare-pkg"] }], "core")).toEqual([
      {
        name: "bare-pkg",
        description: "",
        version: "unknown",
        homepage: undefined,
        repo: "core",
        formal: undefined,
      },
    ]);
  });
});
