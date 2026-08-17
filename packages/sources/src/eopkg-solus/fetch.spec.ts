import { describe, expect, it } from "vitest";
import { parseIndexXml } from "./fetch";

const INDEX_FIXTURE = `<?xml version="1.0"?>
<PISI>
    <Distribution>
        <SourceName>Solus</SourceName>
    </Distribution>
    <Package>
        <Name>0ad</Name>
        <Summary xml:lang="en">0 A.D. is a real-time strategy game</Summary>
        <Summary xml:lang="fr">0 A.D. est un jeu de stratégie</Summary>
        <PartOf>games.strategy</PartOf>
        <History>
            <Update release="60">
                <Date>2025-10-08</Date>
                <Version>0.27.1</Version>
            </Update>
            <Update release="52">
                <Date>2024-01-30</Date>
                <Version>0.0.26</Version>
            </Update>
        </History>
        <Source>
            <Name>0ad</Name>
            <Homepage>https://play0ad.com/</Homepage>
        </Source>
    </Package>
    <Package>
        <Name>bare-pkg</Name>
        <Summary xml:lang="en">A minimal package</Summary>
        <History>
            <Update release="1">
                <Date>2024-01-01</Date>
                <Version>1.0</Version>
            </Update>
        </History>
    </Package>
</PISI>
`;

describe("parseIndexXml", () => {
  const entries = parseIndexXml(INDEX_FIXTURE);

  it("parses every package", () => {
    expect(entries.map((entry) => entry.name)).toEqual(["0ad", "bare-pkg"]);
  });

  it("picks the English summary when multiple languages are present", () => {
    expect(entries[0]?.summary).toBe("0 A.D. is a real-time strategy game");
  });

  it("uses the most recent History Update's Version", () => {
    expect(entries[0]?.version).toBe("0.27.1");
  });

  it("extracts PartOf and the Source Homepage", () => {
    expect(entries[0]?.partOf).toBe("games.strategy");
    expect(entries[0]?.homepage).toBe("https://play0ad.com/");
  });

  it("falls back gracefully when optional fields are missing", () => {
    expect(entries[1]).toEqual({
      name: "bare-pkg",
      summary: "A minimal package",
      version: "1.0",
      homepage: undefined,
      partOf: undefined,
    });
  });
});
