import { describe, expect, it } from "vitest";
import { isMxPackage, parsePackages } from "./fetch";

describe("isMxPackage", () => {
  it("matches mx-prefixed, per-release mxNN-, and mxfb- names", () => {
    expect(isMxPackage("mx-tweak")).toBe(true);
    expect(isMxPackage("mx25-artwork")).toBe(true);
    expect(isMxPackage("mxfb-docs")).toBe(true);
  });

  it("does not match unrelated packages", () => {
    expect(isMxPackage("firefox")).toBe(false);
    expect(isMxPackage("libqt5core5a")).toBe(false);
  });
});

const FIXTURE = `Package: mx-tweak
Version: 25.0-1
Section: utils
Homepage: https://github.com/MX-Linux/mx-tweak
Description: MX Tweak
 Tool to tweak various MX Linux settings.

Package: mx-docs-en
Version: 25.0-1
Section: doc
Description: MX Linux documentation (English)
 English documentation for MX Linux.

Package: firefox-esr
Version: 140.13.0
Section: web
Description: Safe and easy web browser from Mozilla
 Firefox for MX Linux.
`;

describe("parsePackages", () => {
  const entries = parsePackages(FIXTURE);

  it("keeps only MX-authored packages", () => {
    expect(entries.map((entry) => entry.name)).toEqual(["mx-tweak", "mx-docs-en"]);
  });

  it("extracts description, version, homepage, section", () => {
    expect(entries[0]).toEqual({
      name: "mx-tweak",
      description: "MX Tweak",
      version: "25.0-1",
      homepage: "https://github.com/MX-Linux/mx-tweak",
      section: "utils",
    });
  });
});
