import { describe, expect, it } from "vitest";
import { mapStanzas, parseApkindex } from "./fetch";

const APKINDEX_FIXTURE = `C:Q1NH6x7ZVrTqn3VGktcofFNWa+fmQ=
P:7zip
V:26.01-r0
A:x86_64
S:917978
I:1788296
T:File archiver with a high compression ratio
U:https://7-zip.org/
L:LGPL-2.0-only
o:7zip
t:1781823476
c:95517ce1c51299aab27993a87b4d44f996ca1cba
k:100
D:so:libc.musl-x86_64.so.1 so:libgcc_s.so.1 so:libstdc++.so.6
p:7zip-virtual p7zip=26.01-r0 cmd:7z=26.01-r0 cmd:7zz=26.01-r0

C:Q1RDuKalflGO21hEVkqHv/1mVEbTc=
P:aaudit
V:0.7.2-r3
A:x86_64
S:3313
I:3097
T:Alpine Auditor
o:aaudit
`;

describe("parseApkindex", () => {
  const stanzas = parseApkindex(APKINDEX_FIXTURE);

  it("splits into one stanza per package", () => {
    expect(stanzas.map((s) => s.P)).toEqual(["7zip", "aaudit"]);
  });

  it("extracts single-line fields, including multi-value ones as a single raw string", () => {
    expect(stanzas[0]?.T).toBe("File archiver with a high compression ratio");
    expect(stanzas[0]?.U).toBe("https://7-zip.org/");
    expect(stanzas[0]?.V).toBe("26.01-r0");
  });

  it("falls back gracefully when optional fields are missing", () => {
    expect(stanzas[1]?.U).toBeUndefined();
  });

  it("returns an empty array for text with no stanzas", () => {
    expect(parseApkindex("")).toEqual([]);
  });
});

describe("mapStanzas", () => {
  it("maps parsed fields to a cache entry, stamping the given repo", () => {
    const stanzas = parseApkindex(APKINDEX_FIXTURE);

    expect(mapStanzas(stanzas, "main")).toEqual([
      {
        name: "7zip",
        description: "File archiver with a high compression ratio",
        version: "26.01-r0",
        homepage: "https://7-zip.org/",
        repo: "main",
      },
      {
        name: "aaudit",
        description: "Alpine Auditor",
        version: "0.7.2-r3",
        homepage: undefined,
        repo: "main",
      },
    ]);
  });

  it("drops entries with no P (name)", () => {
    expect(mapStanzas([{ T: "orphaned" }], "community")).toEqual([]);
  });

  it("falls back gracefully when optional fields are missing", () => {
    expect(mapStanzas([{ P: "bare-pkg" }], "community")).toEqual([
      {
        name: "bare-pkg",
        description: "",
        version: "unknown",
        homepage: undefined,
        repo: "community",
      },
    ]);
  });
});
