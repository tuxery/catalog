import { describe, expect, it } from "vitest";
import {
  parseCpvFilename,
  parseEbuildCache,
  pickLatestPerPackage,
  pickLatestVersion,
} from "./fetch";

describe("parseEbuildCache", () => {
  it("extracts KEY=value fields", () => {
    const content =
      "DESCRIPTION=A free, real-time strategy game\nHOMEPAGE=https://play0ad.com/\nEAPI=8\n";
    expect(parseEbuildCache(content)).toEqual({
      DESCRIPTION: "A free, real-time strategy game",
      HOMEPAGE: "https://play0ad.com/",
      EAPI: "8",
    });
  });

  it("keeps everything after the first = as the value", () => {
    expect(parseEbuildCache("SRC_URI=https://example.com/a?b=c\n")).toEqual({
      SRC_URI: "https://example.com/a?b=c",
    });
  });

  it("returns an empty object for content with no fields", () => {
    expect(parseEbuildCache("")).toEqual({});
  });
});

describe("parseCpvFilename", () => {
  it("splits a simple name and version", () => {
    expect(parseCpvFilename("0ad-0.27.1")).toEqual({ name: "0ad", version: "0.27.1" });
  });

  it("keeps a -rN revision as part of the version", () => {
    expect(parseCpvFilename("0ad-0.28.0-r1")).toEqual({ name: "0ad", version: "0.28.0-r1" });
  });

  it("handles a package name that itself contains digits", () => {
    expect(parseCpvFilename("7zip-1.5.2")).toEqual({ name: "7zip", version: "1.5.2" });
  });

  it("handles an _alpha-suffixed version", () => {
    expect(parseCpvFilename("colobot-0.2.2_alpha")).toEqual({
      name: "colobot",
      version: "0.2.2_alpha",
    });
  });

  it("handles a live (9999) version", () => {
    expect(parseCpvFilename("colobot-9999")).toEqual({ name: "colobot", version: "9999" });
  });

  it("returns undefined for a filename with no version-shaped suffix", () => {
    expect(parseCpvFilename("Manifest.gz")).toBeUndefined();
  });
});

describe("pickLatestVersion", () => {
  it("picks the highest real version", () => {
    const entries = [{ version: "0.27.1" }, { version: "0.28.0" }, { version: "0.28.0-r1" }];
    expect(pickLatestVersion(entries)).toEqual({ version: "0.28.0-r1" });
  });

  it("prefers any pinned release over a live (9999) version", () => {
    const entries = [{ version: "9999" }, { version: "1.2.0" }];
    expect(pickLatestVersion(entries)).toEqual({ version: "1.2.0" });
  });

  it("falls back to the live version when it's the only one", () => {
    expect(pickLatestVersion([{ version: "9999" }])).toEqual({ version: "9999" });
  });

  it("ranks a trailing letter above the plain version, but a _suffix below it", () => {
    const entries = [{ version: "1.0" }, { version: "1.0a" }, { version: "1.0_alpha" }];
    expect(pickLatestVersion(entries)).toEqual({ version: "1.0a" });
  });
});

describe("pickLatestPerPackage", () => {
  it("keeps one entry per category/package, the latest version", () => {
    const entries = [
      {
        category: "games-strategy",
        name: "0ad",
        version: "0.27.1",
        description: "",
        homepage: undefined,
      },
      {
        category: "games-strategy",
        name: "0ad",
        version: "0.28.0",
        description: "",
        homepage: undefined,
      },
      { category: "app-arch", name: "7zip", version: "1.0", description: "", homepage: undefined },
    ];

    const result = pickLatestPerPackage(entries);
    expect(result).toHaveLength(2);
    expect(result.find((e) => e.name === "0ad")?.version).toBe("0.28.0");
  });
});
