import { zstdCompressSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractPrimaryLocation, fetchPrimaryXml, parsePrimaryXml } from "./rpm-repodata";

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
    <rpm:provides>
      <rpm:entry name="0ad" flags="EQ" epoch="0" ver="0.28.0" rel="1.5"/>
      <rpm:entry name="application()"/>
      <rpm:entry name="application(0ad.desktop)"/>
      <rpm:entry name="metainfo(0ad.appdata.xml)"/>
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
      hasDesktopFile: true,
    });
  });

  it("falls back gracefully when optional fields, including group, are missing", () => {
    expect(entries[1]).toEqual({
      name: "0ad-data",
      summary: "Data files for 0ad",
      version: "0.28.0",
      homepage: undefined,
      group: undefined,
      hasDesktopFile: false,
    });
  });

  it("does not flag a bare application()/metainfo() marker without a .desktop file name as hasDesktopFile", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<metadata xmlns="http://linux.duke.edu/metadata/common" xmlns:rpm="http://linux.duke.edu/metadata/rpm" packages="1">
<package type="rpm">
  <name>no-desktop-file</name>
  <version epoch="0" ver="1.0" rel="1"/>
  <format>
    <rpm:provides>
      <rpm:entry name="application()"/>
      <rpm:entry name="metainfo()"/>
    </rpm:provides>
  </format>
</package>
</metadata>
`;
    expect(parsePrimaryXml(xml)[0]?.hasDesktopFile).toBe(false);
  });
});

describe("fetchPrimaryXml", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("chains repomd.xml -> extractPrimaryLocation -> the zstd-compressed primary.xml, decompressed", async () => {
    const compressedPrimary = zstdCompressSync(Buffer.from(PRIMARY_FIXTURE, "utf8"));
    const fetchMock = vi.fn<typeof fetch>((url) => {
      const href = url.toString();
      if (href === "https://example.com/repo/repodata/repomd.xml") {
        return Promise.resolve(new Response(REPOMD_FIXTURE, { status: 200 }));
      }
      if (href === "https://example.com/repo/repodata/c48e475-primary.xml.zst") {
        return Promise.resolve(new Response(compressedPrimary, { status: 200 }));
      }
      throw new Error(`unexpected URL in test: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const xml = await fetchPrimaryXml("https://example.com/repo", "Example");

    expect(xml).toBe(PRIMARY_FIXTURE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a source-labeled error when repomd.xml itself fails to fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response("nope", { status: 500, statusText: "Server Error" })),
      ),
    );

    await expect(fetchPrimaryXml("https://example.com/repo", "Example")).rejects.toThrow(
      "Failed to fetch Example repomd.xml at https://example.com/repo: 500 Server Error",
    );
  });

  it("throws when repomd.xml has no primary data location, without attempting a second fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response("<repomd></repomd>", { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPrimaryXml("https://example.com/repo", "Example")).rejects.toThrow(
      "Example repomd.xml at https://example.com/repo has no primary data location",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
