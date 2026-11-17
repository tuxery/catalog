import { describe, expect, it } from "vitest";
import { parseReleaseCodename } from "./fetch";

describe("parseReleaseCodename", () => {
  it("reads the Codename of a Release file", () => {
    const release =
      "Origin: Debian\nLabel: Debian\nSuite: stable\nVersion: 13.7\nCodename: trixie\n" +
      "Changelogs: https://metadata.ftp-master.debian.org/changelogs/@CHANGEPATH@_changelog\n";
    expect(parseReleaseCodename(release)).toBe("trixie");
  });

  it("is undefined without one", () => {
    expect(parseReleaseCodename("Origin: Debian\nSuite: stable\n")).toBeUndefined();
  });
});
