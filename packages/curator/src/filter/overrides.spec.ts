import { describe, expect, it } from "vitest";
import { loadFilterOverrides, overrideKey } from "./overrides";

describe("overrideKey", () => {
  it("combines source and name", () => {
    expect(overrideKey({ source: "debian", name: "firefox" })).toBe("debian:firefox");
  });
});

describe("loadFilterOverrides", () => {
  it("reads the real override files without throwing", () => {
    const overrides = loadFilterOverrides();

    expect(overrides.keep).toBeInstanceOf(Set);
    expect(overrides.exclude).toBeInstanceOf(Set);
  });

  it("rescues the real lib*-prefixed exceptions via keep.ndjson", () => {
    // Regression guard for the lib* noise-prefix inversion (see
    // filter/rules.ts) — these names would otherwise silently vanish from
    // the catalog if keep.ndjson ever lost an entry.
    const overrides = loadFilterOverrides();

    expect(overrides.keep.has("debian:libreoffice")).toBe(true);
    expect(overrides.keep.has("debian:librecad")).toBe(true);
    expect(overrides.keep.has("arch:libreoffice-fresh")).toBe(true);
    expect(overrides.keep.has("aur:libre-menu-editor")).toBe(true);
    expect(overrides.keep.has("aur:libreddit")).toBe(true);
    expect(overrides.keep.has("aur:libremines")).toBe(true);
  });
});
