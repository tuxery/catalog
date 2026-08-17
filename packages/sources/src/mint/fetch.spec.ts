import { describe, expect, it } from "vitest";
import { parsePackages } from "./fetch";

const FIXTURE = `Package: bulky
Version: 4.2
Architecture: all
Maintainer: Linux Mint <root@linuxmint.com>
Section: misc
Description: Bulk Renamer
 Utility application used to rename multiple files.

Package: aptkit
Version: 1.1.2
Architecture: all
Homepage: https://github.com/linuxmint/aptkit
Section: admin
Description: transaction based package management service
 Aptkit allows users to perform package management tasks.
`;

describe("parsePackages", () => {
  const entries = parsePackages(FIXTURE);

  it("parses every package", () => {
    expect(entries.map((entry) => entry.name)).toEqual(["bulky", "aptkit"]);
  });

  it("extracts description, version, section", () => {
    expect(entries[0]).toEqual({
      name: "bulky",
      description: "Bulk Renamer",
      version: "4.2",
      homepage: undefined,
      section: "misc",
    });
  });

  it("extracts the homepage when present", () => {
    expect(entries[1]?.homepage).toBe("https://github.com/linuxmint/aptkit");
  });
});
