import { describe, expect, it } from "vitest";
import { extractPrimaryLocation, parsePrimaryXml } from "./rpm-repodata";

const REPOMD_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<repomd xmlns="http://linux.duke.edu/metadata/repo">
  <revision>1776864872</revision>
  <data type="primary_db">
    <checksum type="sha256">deadbeef</checksum>
    <location href="repodata/deadbeef-primary.sqlite.zst"/>
  </data>
  <data type="primary">
    <checksum type="sha256">c48e475</checksum>
    <location href="repodata/c48e475-primary.xml.zst"/>
    <timestamp>1776864859</timestamp>
  </data>
  <data type="primary_zck">
    <checksum type="sha256">e32a0c3</checksum>
    <location href="repodata/e32a0c3-primary.xml.zck"/>
  </data>
</repomd>
`;

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

describe("extractPrimaryLocation", () => {
  it("finds the primary location, not primary_db or primary_zck", () => {
    expect(extractPrimaryLocation(REPOMD_FIXTURE)).toBe("repodata/c48e475-primary.xml.zst");
  });

  it("returns undefined when there's no primary data", () => {
    expect(extractPrimaryLocation("<repomd></repomd>")).toBeUndefined();
  });
});

describe("parsePrimaryXml", () => {
  const entries = parsePrimaryXml(PRIMARY_FIXTURE);

  it("parses every package", () => {
    expect(entries.map((entry) => entry.name)).toEqual(["0ad", "0ad-data"]);
  });

  it("extracts summary, version, homepage, and rpm:group", () => {
    expect(entries[0]).toEqual({
      name: "0ad",
      summary: "Cross-Platform RTS Game of Ancient Warfare",
      version: "0.28.0",
      homepage: "https://play0ad.com/",
      group: "Amusements/Games/Strategy/Real Time",
    });
  });

  it("falls back gracefully when optional fields, including group, are missing", () => {
    expect(entries[1]).toEqual({
      name: "0ad-data",
      summary: "Data files for 0ad",
      version: "0.28.0",
      homepage: undefined,
      group: undefined,
    });
  });
});
