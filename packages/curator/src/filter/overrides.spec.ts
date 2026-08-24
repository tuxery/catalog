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

  it("rescues the real SDK-toolchain exceptions via keep.ndjson", () => {
    // Regression guard for the -sdk noise pattern (see filter/rules.ts) —
    // dotnet-sdk, wasi-sdk, google-cloud-sdk and bare android-sdk are real
    // CLI toolchains, not API client libraries.
    const overrides = loadFilterOverrides();

    expect(overrides.keep.has("snap-snapcraft:dotnet-sdk")).toBe(true);
    expect(overrides.keep.has("rpm-fedora:dotnet-sdk-9.0")).toBe(true);
    expect(overrides.keep.has("apk-alpine:wasi-sdk")).toBe(true);
    expect(overrides.keep.has("nix-nixpkgs:google-cloud-sdk")).toBe(true);
    expect(overrides.keep.has("pacman-aur:android-sdk")).toBe(true);
  });

  it("rescues the real apt-show-source exception via keep.ndjson", () => {
    // Regression guard for the Debian-family -source noise suffix (see
    // filter/rules.ts's looksLikeSourceSpecificNoise) — a real CLI tool
    // that shows info about source packages, not shipped source code
    // itself.
    const overrides = loadFilterOverrides();

    expect(overrides.keep.has("deb-debian:apt-show-source")).toBe(true);
    expect(overrides.keep.has("deb-ubuntu:apt-show-source")).toBe(true);
  });
});
