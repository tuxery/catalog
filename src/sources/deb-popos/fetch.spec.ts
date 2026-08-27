import { describe, expect, it } from "vitest";
import { isSystem76Package, parsePackages } from "./fetch";

describe("isSystem76Package", () => {
  it("matches cosmic-/pop-/system76-prefixed names", () => {
    expect(isSystem76Package("cosmic-files")).toBe(true);
    expect(isSystem76Package("pop-launcher")).toBe(true);
    expect(isSystem76Package("system76-power")).toBe(true);
  });

  it("does not match unrelated rebuilds System76 also maintains", () => {
    expect(isSystem76Package("firefox")).toBe(false);
    expect(isSystem76Package("firefox-locale-fr")).toBe(false);
    expect(isSystem76Package("ubuntu-release-upgrader-core")).toBe(false);
  });
});

const FIXTURE = `Package: cosmic-files
Version: 1.0.0~1770000000~26.04~abc1234
Section: admin
Homepage: https://github.com/pop-os/cosmic-files
Description: The COSMIC Files application
 File manager for the COSMIC desktop environment.

Package: firefox
Version: 153.0.4
Section: web
Description: Safe and easy web browser from Mozilla
 Firefox rebuilt for Pop!_OS.
`;

describe("parsePackages", () => {
  it("keeps only System76-authored packages", () => {
    const entries = parsePackages(FIXTURE);

    expect(entries.map((entry) => entry.name)).toEqual(["cosmic-files"]);
  });

  it("extracts description, version, homepage, section", () => {
    const entries = parsePackages(FIXTURE);

    expect(entries[0]).toEqual({
      name: "cosmic-files",
      description: "The COSMIC Files application",
      version: "1.0.0~1770000000~26.04~abc1234",
      homepage: "https://github.com/pop-os/cosmic-files",
      section: "admin",
    });
  });
});
