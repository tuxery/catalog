import { describe, expect, it } from "vitest";
import { mergeByName, parsePrimary } from "./fetch";

// repomd.xml -> extractPrimaryLocation is shared with Fedora/openSUSE and
// tested once, at the source, in _shared/rpm-repodata.spec.ts.

const PRIMARY_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<metadata xmlns="http://linux.duke.edu/metadata/common" xmlns:rpm="http://linux.duke.edu/metadata/rpm" packages="2">
<package type="rpm">
  <name>stepmania</name>
  <arch>x86_64</arch>
  <version epoch="0" ver="5.1.0" rel="1.fc44"/>
  <summary>Advanced cross-platform rhythm game</summary>
  <url>https://www.stepmania.com/</url>
  <format>
    <rpm:group>Amusements/Games</rpm:group>
    <rpm:provides>
      <rpm:entry name="application(stepmania.desktop)"/>
    </rpm:provides>
  </format>
</package>
<package type="rpm">
  <name>libbluray</name>
  <arch>x86_64</arch>
  <version epoch="0" ver="1.3.4" rel="1.fc44"/>
  <summary>Library to access Blu-Ray disks for video playback</summary>
</package>
</metadata>
`;

describe("parsePrimary", () => {
  const entries = parsePrimary(PRIMARY_FIXTURE);

  it("parses every package", () => {
    expect(entries.map((entry) => entry.name)).toEqual(["stepmania", "libbluray"]);
  });

  it("keeps the real <rpm:group> value, unlike rpm-fedora's parsePrimary which drops it", () => {
    expect(entries[0]).toEqual({
      name: "stepmania",
      summary: "Advanced cross-platform rhythm game",
      version: "5.1.0",
      homepage: "https://www.stepmania.com/",
      group: "Amusements/Games",
      hasDesktopFile: true,
    });
  });

  it("falls back gracefully when group/homepage/desktop-file evidence are missing", () => {
    expect(entries[1]).toEqual({
      name: "libbluray",
      summary: "Library to access Blu-Ray disks for video playback",
      version: "1.3.4",
      homepage: undefined,
      group: undefined,
      hasDesktopFile: false,
    });
  });
});

describe("mergeByName", () => {
  it("keeps entries unique to any repo", () => {
    const free = [
      { name: "a", summary: "", version: "1", homepage: undefined, hasDesktopFile: false },
    ];
    const nonfree = [
      { name: "b", summary: "", version: "1", homepage: undefined, hasDesktopFile: false },
    ];

    expect(new Set(mergeByName([free, nonfree]).map((e) => e.name))).toEqual(new Set(["a", "b"]));
  });

  it("a later repo's entry wins for the same name — free-updates over free", () => {
    const free = [
      { name: "a", summary: "old", version: "1.0", homepage: undefined, hasDesktopFile: false },
    ];
    const freeUpdates = [
      { name: "a", summary: "new", version: "1.1", homepage: undefined, hasDesktopFile: true },
    ];

    expect(mergeByName([free, freeUpdates])).toEqual([
      { name: "a", summary: "new", version: "1.1", homepage: undefined, hasDesktopFile: true },
    ]);
  });
});
