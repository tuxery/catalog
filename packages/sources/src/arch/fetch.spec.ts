import { describe, expect, it } from "vitest";
import { mapDescFiles, parseDesc } from "./fetch";

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
`;

describe("parseDesc", () => {
  it("extracts single-line fields", () => {
    const fields = parseDesc(DESC_FIXTURE);

    expect(fields.NAME).toBe("0ad");
    expect(fields.VERSION).toBe("0.28.0-3");
    expect(fields.DESC).toBe("Cross-platform, 3D and historically-based real-time strategy game");
    expect(fields.URL).toBe("http://play0ad.com/");
  });

  it("keeps only the first line of a multi-line field", () => {
    expect(parseDesc(DESC_FIXTURE).DEPENDS).toBe("0ad-data=0.28.0");
  });

  it("returns an empty object for content with no fields", () => {
    expect(parseDesc("")).toEqual({});
  });
});

describe("mapDescFiles", () => {
  it("maps parsed fields to a cache entry", () => {
    expect(mapDescFiles([parseDesc(DESC_FIXTURE)])).toEqual([
      {
        name: "0ad",
        description: "Cross-platform, 3D and historically-based real-time strategy game",
        version: "0.28.0-3",
        homepage: "http://play0ad.com/",
      },
    ]);
  });

  it("drops entries with no NAME", () => {
    expect(mapDescFiles([{ DESC: "orphaned" }])).toEqual([]);
  });

  it("falls back gracefully when optional fields are missing", () => {
    expect(mapDescFiles([{ NAME: "bare-pkg" }])).toEqual([
      { name: "bare-pkg", description: "", version: "unknown", homepage: undefined },
    ]);
  });
});
