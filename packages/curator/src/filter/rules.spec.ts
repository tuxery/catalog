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

  it("flags Fedora-style dev/debug suffixes", () => {
    expect(looksLikeSupportPackage("zlib-devel")).toBe(true);
    expect(looksLikeSupportPackage("glibc-debuginfo")).toBe(true);
    expect(looksLikeSupportPackage("glibc-debugsource")).toBe(true);
  });

  it("flags lib-prefixed packages, including soname-versioned ones", () => {
    expect(looksLikeSupportPackage("libssl3")).toBe(true);
    expect(looksLikeSupportPackage("libgtk-3-0")).toBe(true);
    // Not soname-versioned, but still a library — the old digit-suffix-only
    // pattern missed these (56k+ across sources, see filter/rules.ts).
    expect(looksLikeSupportPackage("libcurl")).toBe(true);
    expect(looksLikeSupportPackage("libaio")).toBe(true);
  });

  it("flags Fedora's -libs and -static suffixes", () => {
    expect(looksLikeSupportPackage("zlib-libs")).toBe(true);
    expect(looksLikeSupportPackage("glibc-static")).toBe(true);
  });

  it("flags font packages", () => {
    expect(looksLikeSupportPackage("fonts-cantarell")).toBe(true);
    expect(looksLikeSupportPackage("ttf-mscorefonts-installer")).toBe(true);
  });

  it("flags Fedora-style Perl/OCaml/Haskell/Lua/R/Tcl module packages", () => {
    expect(looksLikeSupportPackage("perl-DBI")).toBe(true);
    expect(looksLikeSupportPackage("ocaml-astring")).toBe(true);
    expect(looksLikeSupportPackage("ghc-Cabal")).toBe(true);
    expect(looksLikeSupportPackage("lua-cqueues")).toBe(true);
    expect(looksLikeSupportPackage("R-DBI")).toBe(true);
    expect(looksLikeSupportPackage("tcl-snack")).toBe(true);
  });

  it("flags real apps that happen to start with lib — rescued via overrides, not by pattern", () => {
    // A bare `^lib` prefix is deliberately broad now (see filter/rules.ts's
    // header comment) — LibreOffice/LibreCAD are real exceptions, but they
    // go through overrides/keep.ndjson by exact name, not a smarter regex.
    // Extending the regex to also spare them doesn't scale: 1,200+ other
    // `libre*` names are coincidentally "lib" + a word starting with "re"
    // (libreadline, librealsense, librecast, ...), not real "Libre"-branded
    // apps, so no name-only pattern can tell them apart.
    expect(looksLikeSupportPackage("libreoffice")).toBe(true);
    expect(looksLikeSupportPackage("libreoffice-writer")).toBe(true);
    expect(looksLikeSupportPackage("librecad")).toBe(true);
  });

  it("does not flag ordinary app/game/CLI-tool names", () => {
    expect(looksLikeSupportPackage("firefox")).toBe(false);
    expect(looksLikeSupportPackage("gimp")).toBe(false);
    expect(looksLikeSupportPackage("ripgrep")).toBe(false);
    expect(looksLikeSupportPackage("0ad")).toBe(false);
  });
});
