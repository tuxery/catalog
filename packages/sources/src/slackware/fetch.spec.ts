import { describe, expect, it } from "vitest";
import { parsePackagesTxt, splitPackageFilename } from "./fetch";

const PACKAGES_TXT_FIXTURE = `PACKAGES.TXT;  Sun Aug 16 20:41:13 UTC 2026

This file provides details on the Slackware packages found
in the ./slackware64/ directory.

PACKAGE NAME:  AMF-headers-1.5.2-noarch-1.txz
PACKAGE LOCATION:  ./slackware64/d
PACKAGE SIZE (compressed):  64 K
PACKAGE SIZE (uncompressed):  650 K
PACKAGE DESCRIPTION:
AMF-headers: AMF-headers (Advanced Media Framework headers)
AMF-headers:
AMF-headers: AMF is a light-weight, portable multimedia framework.
AMF-headers:
AMF-headers: Homepage: https://github.com/GPUOpen-LibrariesAndSDKs/AMF/wiki
AMF-headers:

PACKAGE NAME:  gcc-gdc-15.2.0-x86_64-1.txz
PACKAGE LOCATION:  ./slackware64/d
PACKAGE SIZE (compressed):  4416 K
PACKAGE SIZE (uncompressed):  21670 K
PACKAGE DESCRIPTION:
gcc-gdc: gcc-gdc (D support for GCC)
gcc-gdc:
gcc-gdc: For information, see: https://gcc.gnu.org/
gcc-gdc:
`;

describe("splitPackageFilename", () => {
  it("splits a simple name", () => {
    expect(splitPackageFilename("Cython-3.2.9-x86_64-1.txz")).toEqual({
      name: "Cython",
      version: "3.2.9-1",
    });
  });

  it("keeps hyphens inside the name intact", () => {
    expect(splitPackageFilename("gcc-gdc-15.2.0-x86_64-1.txz")).toEqual({
      name: "gcc-gdc",
      version: "15.2.0-1",
    });
  });

  it("falls back gracefully on an unexpected shape", () => {
    expect(splitPackageFilename("not-a-real-filename")).toEqual({
      name: "not-a-real-filename",
      version: "unknown",
    });
  });
});

describe("parsePackagesTxt", () => {
  const entries = parsePackagesTxt(PACKAGES_TXT_FIXTURE);

  it("parses every package block, ignoring the header", () => {
    expect(entries.map((entry) => entry.name)).toEqual(["AMF-headers", "gcc-gdc"]);
  });

  it("extracts the series from PACKAGE LOCATION", () => {
    expect(entries[0]?.series).toBe("d");
  });

  it("extracts the summary from the first description line", () => {
    expect(entries[0]?.summary).toBe("AMF-headers (Advanced Media Framework headers)");
  });

  it("extracts a Homepage: line when present", () => {
    expect(entries[0]?.homepage).toBe("https://github.com/GPUOpen-LibrariesAndSDKs/AMF/wiki");
  });

  it("leaves homepage undefined when there's no Homepage: line, even if a URL appears in prose", () => {
    expect(entries[1]?.homepage).toBeUndefined();
  });
});
