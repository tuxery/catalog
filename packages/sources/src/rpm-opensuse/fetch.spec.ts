import { describe, expect, it } from "vitest";
import { parsePrimary } from "./fetch";

// repomd.xml -> extractPrimaryLocation is shared with Fedora and tested
// once, at the source, in _shared/rpm-repodata.spec.ts — no need to
// re-test it here now that fetchRepo delegates to
// _shared/rpm-repodata.ts's fetchPrimaryXml instead of hand-rolling it.

const PRIMARY_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<metadata xmlns="http://linux.duke.edu/metadata/common" xmlns:rpm="http://linux.duke.edu/metadata/rpm" packages="2">
<package type="rpm">
  <name>0ad</name>
  <arch>x86_64</arch>
  <version epoch="0" ver="0.28.0" rel="1.5"/>
  <summary>Cross-Platform RTS Game of Ancient Warfare</summary>
  <url>https://play0ad.com/</url>
  <format>
    <rpm:group>Amusements/Games/Strategy/Real Time</rpm:group>
    <rpm:provides>
      <rpm:entry name="application(0ad.desktop)"/>
    </rpm:provides>
  </format>
</package>
<package type="rpm">
  <name>0ad-data</name>
  <arch>noarch</arch>
  <version epoch="0" ver="0.28.0" rel="1.5"/>
  <summary>Data files for 0ad</summary>
</package>
</metadata>
`;

describe("parsePrimary", () => {
  const entries = parsePrimary(PRIMARY_FIXTURE, "oss");

  it("parses every package, tagged with the given repo", () => {
    expect(entries.map((entry) => entry.name)).toEqual(["0ad", "0ad-data"]);
    expect(entries.every((entry) => entry.repo === "oss")).toBe(true);
  });

  it("extracts summary, version, homepage, group, and hasDesktopFile", () => {
    expect(entries[0]).toEqual({
      name: "0ad",
      summary: "Cross-Platform RTS Game of Ancient Warfare",
      version: "0.28.0",
      homepage: "https://play0ad.com/",
      repo: "oss",
      group: "Amusements/Games/Strategy/Real Time",
      hasDesktopFile: true,
    });
  });

  it("falls back gracefully when optional fields are missing", () => {
    expect(entries[1]).toEqual({
      name: "0ad-data",
      summary: "Data files for 0ad",
      version: "0.28.0",
      homepage: undefined,
      repo: "oss",
      group: undefined,
      hasDesktopFile: false,
    });
  });
});
