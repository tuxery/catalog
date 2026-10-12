import { describe, expect, it } from "vitest";
import { gentooLicenseToSpdx } from "./license";

describe("gentooLicenseToSpdx", () => {
  it("maps every term of 0ad's real LICENSE and ANDs them", () => {
    expect(
      gentooLicenseToSpdx("BitstreamVera CC-BY-SA-3.0 GPL-2 LGPL-2.1 LPPL-1.3c MIT ZLIB"),
    ).toBe(
      "BitstreamVera AND CC-BY-SA-3.0 AND GPL-2.0-only AND LGPL-2.1-only AND LPPL-1.3c AND MIT AND Zlib",
    );
  });

  it("turns || ( ) into OR, parenthesised inside an AND", () => {
    expect(gentooLicenseToSpdx("GPL-2 || ( MIT BSD )")).toBe(
      "GPL-2.0-only AND (MIT OR BSD-3-Clause)",
    );
    expect(gentooLicenseToSpdx("|| ( GPL-2+ MIT )")).toBe("GPL-2.0-or-later OR MIT");
  });

  it("drops USE-conditional groups", () => {
    expect(gentooLicenseToSpdx("GPL-3 gui? ( freedist ) !gui? ( MIT )")).toBe("GPL-3.0-only");
  });

  it("keeps an unknown Gentoo name as is", () => {
    expect(gentooLicenseToSpdx("freedist")).toBe("freedist");
  });

  it("is undefined for nothing", () => {
    expect(gentooLicenseToSpdx("")).toBeUndefined();
    expect(gentooLicenseToSpdx(undefined)).toBeUndefined();
    expect(gentooLicenseToSpdx("gui? ( MIT )")).toBeUndefined();
  });
});
