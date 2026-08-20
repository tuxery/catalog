import { describe, expect, it } from "vitest";
import { mergeByName, parsePrimary } from "./fetch";

// repomd.xml -> extractPrimaryLocation is shared with openSUSE and
// tested once, at the source, in _shared/rpm-repodata.spec.ts — no need
// to re-test it here now that fetchRepo delegates to
// _shared/rpm-repodata.ts's fetchPrimaryXml instead of hand-rolling it.

const PRIMARY_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<metadata xmlns="http://linux.duke.edu/metadata/common" xmlns:rpm="http://linux.duke.edu/metadata/rpm" packages="2">
<package type="rpm">
  <name>0ad</name>
  <arch>x86_64</arch>
  <version epoch="0" ver="0.28.0" rel="2.fc44"/>
  <summary>Cross-Platform RTS Game of Ancient Warfare</summary>
  <description>A real-time strategy game.</description>
  <url>http://play0ad.com</url>
  <format>
    <rpm:provides>
      <rpm:entry name="application(0ad.desktop)"/>
    </rpm:provides>
  </format>
</package>
<package type="rpm">
  <name>0ad-data</name>
  <arch>noarch</arch>
  <version epoch="0" ver="0.28.0" rel="1.fc44"/>
  <summary>Data files for 0ad</summary>
</package>
</metadata>
`;

describe("parsePrimary", () => {
  const entries = parsePrimary(PRIMARY_FIXTURE);

  it("parses every package", () => {
    expect(entries.map((entry) => entry.name)).toEqual(["0ad", "0ad-data"]);
  });

  it("extracts summary, version, homepage, and hasDesktopFile", () => {
    expect(entries[0]).toEqual({
      name: "0ad",
      summary: "Cross-Platform RTS Game of Ancient Warfare",
      version: "0.28.0",
      homepage: "http://play0ad.com",
      hasDesktopFile: true,
    });
  });

  it("falls back gracefully when optional fields are missing", () => {
    expect(entries[1]).toEqual({
      name: "0ad-data",
      summary: "Data files for 0ad",
      version: "0.28.0",
      homepage: undefined,
      hasDesktopFile: false,
    });
  });
});

describe("mergeByName", () => {
  it("keeps entries unique to either repo", () => {
    const everything = [
      { name: "a", summary: "", version: "1", homepage: undefined, hasDesktopFile: false },
    ];
    const updates = [
      { name: "b", summary: "", version: "1", homepage: undefined, hasDesktopFile: false },
    ];

    expect(new Set(mergeByName([everything, updates]).map((e) => e.name))).toEqual(
      new Set(["a", "b"]),
    );
  });

  it("a later repo's entry wins for the same name", () => {
    const everything = [
      { name: "a", summary: "old", version: "1.0", homepage: undefined, hasDesktopFile: false },
    ];
    const updates = [
      { name: "a", summary: "new", version: "1.1", homepage: undefined, hasDesktopFile: true },
    ];

    expect(mergeByName([everything, updates])).toEqual([
      { name: "a", summary: "new", version: "1.1", homepage: undefined, hasDesktopFile: true },
    ]);
  });
});
