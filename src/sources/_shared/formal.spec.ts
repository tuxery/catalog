import { describe, expect, it } from "vitest";
import {
  compactFormal,
  debRelationNames,
  relationName,
  relationNames,
  sourceRpmName,
} from "./formal";

describe("relationName", () => {
  it("strips version constraints in every format's syntax", () => {
    expect(relationName("python>=3.8")).toBe("python");
    expect(relationName("libc6 (>= 2.34)")).toBe("libc6");
    expect(relationName("firefox=157.0")).toBe("firefox");
  });

  it("strips Debian architecture qualifiers", () => {
    expect(relationName("python3:any")).toBe("python3");
  });

  it("drops RPM synthetic capabilities and file paths", () => {
    expect(relationName("libc.so.6()(64bit)")).toBeUndefined();
    expect(relationName("pkgconfig(gtk+-3.0)")).toBeUndefined();
    expect(relationName("firefox(x86-64)")).toBeUndefined();
    expect(relationName("/usr/bin/sh")).toBeUndefined();
  });
});

describe("relationNames", () => {
  it("deduplicates and leaves out the package itself", () => {
    expect(relationNames(["firefox", "firefox=157", "firefox-vaapi"], "firefox-vaapi")).toEqual([
      "firefox",
    ]);
  });

  it("returns undefined rather than an empty list", () => {
    expect(relationNames([], "x")).toBeUndefined();
    expect(relationNames(null, "x")).toBeUndefined();
    expect(relationNames(["x"], "x")).toBeUndefined();
  });
});

describe("debRelationNames", () => {
  it("flattens alternatives", () => {
    expect(debRelationNames("libc6 (>= 2.34), firefox-esr | firefox, python3:any", "x")).toEqual([
      "libc6",
      "firefox-esr",
      "firefox",
      "python3",
    ]);
  });
});

describe("sourceRpmName", () => {
  it("drops version and release", () => {
    expect(sourceRpmName("firefox-128.0-1.fc41.src.rpm")).toBe("firefox");
    expect(sourceRpmName("libreoffice-24.8.1.2-2.fc41.src.rpm")).toBe("libreoffice");
  });

  it("returns undefined for anything else", () => {
    expect(sourceRpmName(undefined)).toBeUndefined();
    expect(sourceRpmName("firefox.rpm")).toBeUndefined();
  });
});

describe("compactFormal", () => {
  it("drops empty fields and a base equal to the package name", () => {
    expect(compactFormal("firefox", { base: "firefox", provides: [], depends: ["gtk3"] })).toEqual({
      depends: ["gtk3"],
    });
  });

  it("returns undefined when nothing is declared", () => {
    expect(compactFormal("x", { base: "x", provides: undefined })).toBeUndefined();
  });
});
