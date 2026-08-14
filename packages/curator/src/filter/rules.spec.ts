import { describe, expect, it } from "vitest";
import { looksLikeSupportPackage } from "./rules";

describe("looksLikeSupportPackage", () => {
  it("flags dev/debug/doc suffixes", () => {
    expect(looksLikeSupportPackage("libfoo-dev")).toBe(true);
    expect(looksLikeSupportPackage("myapp-dbg")).toBe(true);
    expect(looksLikeSupportPackage("myapp-dbgsym")).toBe(true);
    expect(looksLikeSupportPackage("myapp-doc")).toBe(true);
    expect(looksLikeSupportPackage("myapp-docs")).toBe(true);
  });

  it("flags soname-versioned shared libraries", () => {
    expect(looksLikeSupportPackage("libssl3")).toBe(true);
    expect(looksLikeSupportPackage("libgtk-3-0")).toBe(true);
  });

  it("flags font packages", () => {
    expect(looksLikeSupportPackage("fonts-cantarell")).toBe(true);
    expect(looksLikeSupportPackage("ttf-mscorefonts-installer")).toBe(true);
  });

  it("does not flag real apps that happen to start with lib", () => {
    // The whole reason this isn't a bare `^lib` prefix check — verified
    // against real Debian cache data before picking these patterns.
    expect(looksLikeSupportPackage("libreoffice")).toBe(false);
    expect(looksLikeSupportPackage("libreoffice-writer")).toBe(false);
    expect(looksLikeSupportPackage("librecad")).toBe(false);
  });

  it("does not flag ordinary app/game/CLI-tool names", () => {
    expect(looksLikeSupportPackage("firefox")).toBe(false);
    expect(looksLikeSupportPackage("gimp")).toBe(false);
    expect(looksLikeSupportPackage("ripgrep")).toBe(false);
    expect(looksLikeSupportPackage("0ad")).toBe(false);
  });
});
