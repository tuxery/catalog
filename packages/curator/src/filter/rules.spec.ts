import { describe, expect, it } from "vitest";
import { looksLikeGuiPackage, looksLikeSupportPackage, looksLikeSupportSection } from "./rules";

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

describe("looksLikeSupportSection", () => {
  it("flags Debian/Ubuntu's library/doc/debug sections", () => {
    expect(looksLikeSupportSection("libs")).toBe(true);
    expect(looksLikeSupportSection("libdevel")).toBe(true);
    expect(looksLikeSupportSection("oldlibs")).toBe(true);
    expect(looksLikeSupportSection("doc")).toBe(true);
    expect(looksLikeSupportSection("debug")).toBe(true);
    expect(looksLikeSupportSection("introspection")).toBe(true);
    expect(looksLikeSupportSection("gnu-r")).toBe(true);
  });

  it("does not flag language-ecosystem sections that mix in real standalone tools", () => {
    // Verified against real cache data (filter/rules.ts's header comment
    // on NOISE_SECTIONS) — these sections aren't purely libraries the way
    // libs/libdevel/doc/debug/introspection/gnu-r are.
    expect(looksLikeSupportSection("python")).toBe(false);
    expect(looksLikeSupportSection("perl")).toBe(false);
    expect(looksLikeSupportSection("golang")).toBe(false);
    expect(looksLikeSupportSection("devel")).toBe(false);
  });

  it("does not flag ordinary app/game sections", () => {
    expect(looksLikeSupportSection("games")).toBe(false);
    expect(looksLikeSupportSection("graphics")).toBe(false);
    expect(looksLikeSupportSection("web")).toBe(false);
  });

  it("flags nixpkgs language-ecosystem attribute-path prefixes, including version-numbered ones", () => {
    expect(looksLikeSupportSection("rPackages")).toBe(true);
    expect(looksLikeSupportSection("haskellPackages")).toBe(true);
    expect(looksLikeSupportSection("python313Packages")).toBe(true);
    expect(looksLikeSupportSection("perlPackages")).toBe(true);
    expect(looksLikeSupportSection("perl5Packages")).toBe(true);
    expect(looksLikeSupportSection("ocamlPackages_latest")).toBe(true);
    expect(looksLikeSupportSection("lua54Packages")).toBe(true);
    expect(looksLikeSupportSection("rubyPackages_3_3")).toBe(true);
    expect(looksLikeSupportSection("chickenPackages_5")).toBe(true);
    expect(looksLikeSupportSection("texlivePackages")).toBe(true);
    expect(looksLikeSupportSection("typstPackages")).toBe(true);
  });

  it("flags nixpkgs toolchain/library sets verified individually, unlike '*Packages' in general", () => {
    expect(looksLikeSupportSection("qt6Packages")).toBe(true);
    expect(looksLikeSupportSection("winePackages")).toBe(true);
    expect(looksLikeSupportSection("wine64Packages")).toBe(true);
    expect(looksLikeSupportSection("wineWoW64Packages")).toBe(true);
    expect(looksLikeSupportSection("godotPackages_4_3")).toBe(true);
    expect(looksLikeSupportSection("postgresql16Packages")).toBe(true);
  });

  it("flags any nixpkgs plugin/extension prefix for a host app — not independently launchable", () => {
    // A general suffix pattern, verified safe across ~10 different
    // host-app namespaces (fish, tmux, obs-studio, netbox, roundcube,
    // gimp, elasticsearch, grafana, ...) — every sample was a plugin.
    expect(looksLikeSupportSection("vimPlugins")).toBe(true);
    expect(looksLikeSupportSection("vscode-extensions")).toBe(true);
    expect(looksLikeSupportSection("gnomeExtensions")).toBe(true);
    expect(looksLikeSupportSection("fishPlugins")).toBe(true);
    expect(looksLikeSupportSection("obs-studio-plugins")).toBe(true);
    expect(looksLikeSupportSection("php83Extensions")).toBe(true);
  });

  it("flags nixpkgs non-application prefixes", () => {
    expect(looksLikeSupportSection("emacsPackages")).toBe(true);
    expect(looksLikeSupportSection("tree-sitter-grammars")).toBe(true);
    expect(looksLikeSupportSection("linuxKernel")).toBe(true);
    expect(looksLikeSupportSection("linuxPackages_xanmod_stable")).toBe(true);
    expect(looksLikeSupportSection("androidenv")).toBe(true);
    expect(looksLikeSupportSection("hyphenDicts")).toBe(true);
    expect(looksLikeSupportSection("terraform-providers")).toBe(true);
  });

  it("does not flag kdePackages or php*Packages — both mix real standalone apps with libraries, same trap as Debian's devel section", () => {
    expect(looksLikeSupportSection("kdePackages")).toBe(false);
    expect(looksLikeSupportSection("php83Packages")).toBe(false);
    expect(looksLikeSupportSection("phpPackages")).toBe(false);
  });

  it("flags openSUSE's library/doc/font/localization/metapackage groups", () => {
    expect(looksLikeSupportSection("System/Libraries")).toBe(true);
    expect(looksLikeSupportSection("Documentation/HTML")).toBe(true);
    expect(looksLikeSupportSection("Documentation/Other")).toBe(true);
    expect(looksLikeSupportSection("System/X11/Fonts")).toBe(true);
    expect(looksLikeSupportSection("System/Localization")).toBe(true);
    expect(looksLikeSupportSection("Metapackages")).toBe(true);
  });

  it("does not flag openSUSE's Development/* groups — same language-ecosystem trap as Debian's devel/python/perl/golang sections", () => {
    expect(looksLikeSupportSection("Development/Libraries/C and C++")).toBe(false);
    expect(looksLikeSupportSection("Development/Languages/Python")).toBe(false);
    expect(looksLikeSupportSection("Development/Languages/Other")).toBe(false);
    expect(looksLikeSupportSection("Development/Tools/Other")).toBe(false);
  });

  it("flags Slackware's l (libraries) and f (FAQs/docs) series", () => {
    expect(looksLikeSupportSection("l")).toBe(true);
    expect(looksLikeSupportSection("f")).toBe(true);
  });

  it("does not flag Slackware's other series — same mixed-real-apps trap as everywhere else", () => {
    expect(looksLikeSupportSection("d")).toBe(false);
    expect(looksLikeSupportSection("a")).toBe(false);
    expect(looksLikeSupportSection("n")).toBe(false);
    expect(looksLikeSupportSection("kde")).toBe(false);
    expect(looksLikeSupportSection("xfce")).toBe(false);
    expect(looksLikeSupportSection("y")).toBe(false);
  });

  it("flags Solus's debug/library/docs/theme/emul32 PartOf values", () => {
    expect(looksLikeSupportSection("debug")).toBe(true);
    expect(looksLikeSupportSection("programming.library")).toBe(true);
    expect(looksLikeSupportSection("desktop.library")).toBe(true);
    expect(looksLikeSupportSection("multimedia.library")).toBe(true);
    expect(looksLikeSupportSection("programming.docs")).toBe(true);
    expect(looksLikeSupportSection("desktop.theme")).toBe(true);
    expect(looksLikeSupportSection("emul32")).toBe(true);
  });

  it("does not flag Solus's other PartOf values — same mixed-real-tools trap, including programming.devel's un-suffixed tail", () => {
    expect(looksLikeSupportSection("programming.devel")).toBe(false);
    expect(looksLikeSupportSection("programming.python")).toBe(false);
    expect(looksLikeSupportSection("programming")).toBe(false);
    expect(looksLikeSupportSection("system.base")).toBe(false);
    expect(looksLikeSupportSection("desktop.kde")).toBe(false);
  });

  it("flags Gentoo's acct-group/acct-user/virtual categories", () => {
    expect(looksLikeSupportSection("acct-group")).toBe(true);
    expect(looksLikeSupportSection("acct-user")).toBe(true);
    expect(looksLikeSupportSection("virtual")).toBe(true);
  });

  it("does not flag Gentoo's other categories", () => {
    expect(looksLikeSupportSection("games-strategy")).toBe(false);
    expect(looksLikeSupportSection("dev-libs")).toBe(false);
  });

  it("does not flag an absent section", () => {
    expect(looksLikeSupportSection(undefined)).toBe(false);
  });
});

describe("looksLikeGuiPackage", () => {
  it("flags real apps in a verified GUI-predictive section", () => {
    expect(looksLikeGuiPackage("abiword", "editors")).toBe(true);
    expect(looksLikeGuiPackage("obs-studio", "video")).toBe(true);
    expect(looksLikeGuiPackage("0ad", "games")).toBe(true);
    expect(looksLikeGuiPackage("wsjtx", "hamradio")).toBe(true);
  });

  it("does not flag sections with real theme/plugin contamination, despite a comparably high raw rate", () => {
    // x11/gnome/kde/xfce were checked and rejected — see rules.ts's
    // GUI_SECTIONS comment for the real theme/icon packages that ride
    // along in these sections (adwaita-icon-theme, breeze-icon-theme, ...).
    expect(looksLikeGuiPackage("some-window-manager", "x11")).toBe(false);
    expect(looksLikeGuiPackage("adwaita-icon-theme", "gnome")).toBe(false);
    expect(looksLikeGuiPackage("breeze-icon-theme", "kde")).toBe(false);
    expect(looksLikeGuiPackage("thunar", "xfce")).toBe(false);
  });

  it("does not flag sections at or below the GUI-rate baseline", () => {
    expect(looksLikeGuiPackage("some-tool", "utils")).toBe(false);
    expect(looksLikeGuiPackage("some-tool", "admin")).toBe(false);
    expect(looksLikeGuiPackage("some-tool", "web")).toBe(false);
    expect(looksLikeGuiPackage("some-tool", "mail")).toBe(false);
  });

  it("does not flag companion data/common/plugin/server/icon packages riding along in a GUI section", () => {
    expect(looksLikeGuiPackage("0ad-data", "games")).toBe(false);
    expect(looksLikeGuiPackage("abiword-common", "editors")).toBe(false);
    expect(looksLikeGuiPackage("ardour-lv2-plugins", "sound")).toBe(false);
    expect(looksLikeGuiPackage("bzflag-server", "games")).toBe(false);
    expect(looksLikeGuiPackage("qtel-icons", "hamradio")).toBe(false);
  });

  it("does not flag names that already look like a support package (-dev/-doc/lib*/...)", () => {
    expect(looksLikeGuiPackage("libreoffice-dev", "editors")).toBe(false);
    expect(looksLikeGuiPackage("libsdl2", "games")).toBe(false);
  });

  it("does not flag an absent section", () => {
    expect(looksLikeGuiPackage("0ad", undefined)).toBe(false);
  });
});
