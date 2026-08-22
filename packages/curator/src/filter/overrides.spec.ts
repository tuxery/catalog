import { describe, expect, it } from "vitest";
import { loadFilterOverrides, overrideKey } from "./overrides";

describe("overrideKey", () => {
  it("combines source and name", () => {
    expect(overrideKey({ source: "deb-debian", name: "firefox" })).toBe("deb-debian:firefox");
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

    expect(overrides.keep.has("deb-debian:libreoffice")).toBe(true);
    expect(overrides.keep.has("deb-debian:librecad")).toBe(true);
    expect(overrides.keep.has("pacman-arch:libreoffice-fresh")).toBe(true);
    expect(overrides.keep.has("pacman-aur:libre-menu-editor")).toBe(true);
    expect(overrides.keep.has("pacman-aur:libreddit")).toBe(true);
    expect(overrides.keep.has("pacman-aur:libremines")).toBe(true);
  });

  it("rescues the real gnome-shell-extension-manager/-installer exceptions via keep.ndjson", () => {
    // Regression guard for the desktop-shell-extension noise prefix (see
    // filter/rules.ts) — these are real standalone tools, not extensions
    // themselves.
    const overrides = loadFilterOverrides();

    expect(overrides.keep.has("deb-debian:gnome-shell-extension-manager")).toBe(true);
    expect(overrides.keep.has("deb-ubuntu:gnome-shell-extension-manager")).toBe(true);
    expect(overrides.keep.has("pacman-aur:gnome-shell-extension-installer")).toBe(true);
  });
});
