import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "../../sources";
import {
  categoryFromDebianSection,
  categoryFromGentooSection,
  categoryFromNixScope,
  categoryFromOpenSuseGroup,
  categoryFromSlackwareSeries,
  categoryFromSolusPartOf,
  gameGenreFromGentooSection,
  gameGenreFromSolusSection,
} from "./category-section";

function pkg(overrides: Partial<SourcedPackage>): SourcedPackage {
  return { source: "deb-debian", name: "example", description: "", version: "1.0", ...overrides };
}

describe("categoryFromDebianSection", () => {
  it("maps sound/video/graphics/math/science/hamradio/editors to their app-taxonomy category", () => {
    expect(categoryFromDebianSection(pkg({ name: "abcde", section: "sound" }))).toBe(
      "Music & Audio",
    );
    expect(categoryFromDebianSection(pkg({ name: "OBS Studio", section: "video" }))).toBe(
      "Photo & Video",
    );
    expect(categoryFromDebianSection(pkg({ name: "DarkRadiant", section: "graphics" }))).toBe(
      "Graphics & Design",
    );
    expect(categoryFromDebianSection(pkg({ name: "Qalculate", section: "math" }))).toBe("Science");
    expect(categoryFromDebianSection(pkg({ name: "Jmol", section: "science" }))).toBe("Science");
    expect(categoryFromDebianSection(pkg({ name: "CubicSDR", section: "hamradio" }))).toBe(
      "Internet & Communication",
    );
    expect(categoryFromDebianSection(pkg({ name: "universal-ctags", section: "editors" }))).toBe(
      "Utilities",
    );
  });

  it("only applies to deb-debian/deb-ubuntu — other sources reuse the section slot for unrelated vocabularies", () => {
    expect(
      categoryFromDebianSection(pkg({ source: "ebuild-gentoo", name: "abcde", section: "sound" })),
    ).toBeUndefined();
  });

  it("returns undefined for a section that stays deliberately unmapped (games — game detection's job — and misc/metapackages, too mixed)", () => {
    expect(categoryFromDebianSection(pkg({ name: "0ad", section: "games" }))).toBeUndefined();
    expect(categoryFromDebianSection(pkg({ name: "ddgr", section: "misc" }))).toBeUndefined();
    expect(
      categoryFromDebianSection(pkg({ name: "astro-tools", section: "metapackages" })),
    ).toBeUndefined();
  });

  it("maps the CLI-flavored sections beyond the GUI-predictive set (second wave)", () => {
    expect(categoryFromDebianSection(pkg({ name: "atuin", section: "utils" }))).toBe("Utilities");
    expect(categoryFromDebianSection(pkg({ name: "mosh", section: "net" }))).toBe(
      "Internet & Communication",
    );
    expect(categoryFromDebianSection(pkg({ name: "neomutt", section: "mail" }))).toBe(
      "Internet & Communication",
    );
    expect(categoryFromDebianSection(pkg({ name: "acmetool", section: "web" }))).toBe(
      "Internet & Communication",
    );
    expect(categoryFromDebianSection(pkg({ name: "asterisk", section: "comm" }))).toBe(
      "Internet & Communication",
    );
    expect(categoryFromDebianSection(pkg({ name: "keepalived", section: "admin" }))).toBe(
      "System Tools",
    );
    expect(categoryFromDebianSection(pkg({ name: "alttab", section: "x11" }))).toBe("System Tools");
    expect(categoryFromDebianSection(pkg({ name: "cachefilesd", section: "otherosfs" }))).toBe(
      "System Tools",
    );
    expect(categoryFromDebianSection(pkg({ name: "dub", section: "devel" }))).toBe(
      "Developer Tools",
    );
    expect(categoryFromDebianSection(pkg({ name: "pypy3", section: "python" }))).toBe(
      "Developer Tools",
    );
    expect(categoryFromDebianSection(pkg({ name: "antlr4", section: "java" }))).toBe(
      "Developer Tools",
    );
    expect(categoryFromDebianSection(pkg({ name: "jqp", section: "golang" }))).toBe(
      "Developer Tools",
    );
    expect(categoryFromDebianSection(pkg({ name: "carton", section: "perl" }))).toBe(
      "Developer Tools",
    );
    expect(categoryFromDebianSection(pkg({ name: "ecl", section: "lisp" }))).toBe(
      "Developer Tools",
    );
    expect(categoryFromDebianSection(pkg({ name: "expect", section: "interpreters" }))).toBe(
      "Developer Tools",
    );
    expect(categoryFromDebianSection(pkg({ name: "iredis", section: "database" }))).toBe(
      "Developer Tools",
    );
    expect(categoryFromDebianSection(pkg({ name: "sigrok", section: "electronics" }))).toBe(
      "Science",
    );
    expect(categoryFromDebianSection(pkg({ name: "bibtex2html", section: "tex" }))).toBe(
      "Productivity",
    );
    expect(categoryFromDebianSection(pkg({ name: "zenity", section: "gnome" }))).toBe("Settings");
    expect(categoryFromDebianSection(pkg({ name: "kalk", section: "kde" }))).toBe("Settings");
    expect(categoryFromDebianSection(pkg({ name: "cconv", section: "text" }))).toBe("Utilities");
    expect(categoryFromDebianSection(pkg({ name: "tex-gyre", section: "fonts" }))).toBe(
      "Graphics & Design",
    );
    expect(categoryFromDebianSection(pkg({ name: "manpages", section: "doc" }))).toBe(
      "Books & Reference",
    );
  });

  it("returns undefined for an absent section", () => {
    expect(categoryFromDebianSection(pkg({ name: "example", section: undefined }))).toBeUndefined();
  });

  it("excludes a companion data/common/plugin/server/icon package riding along in a mapped section, same as looksLikeGuiPackage", () => {
    expect(
      categoryFromDebianSection(pkg({ name: "imagemagick-7-common", section: "graphics" })),
    ).toBeUndefined();
    expect(
      categoryFromDebianSection(pkg({ name: "arb-common", section: "science" })),
    ).toBeUndefined();
  });

  it("excludes a name that already looks like a support package regardless of section", () => {
    expect(
      categoryFromDebianSection(pkg({ name: "libfoo-dev", section: "sound" })),
    ).toBeUndefined();
  });
});

describe("categoryFromGentooSection", () => {
  it("maps any sci- subcategory to Science", () => {
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "Jmol", section: "sci-chemistry" }),
      ),
    ).toBe("Science");
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "octave", section: "sci-mathematics" }),
      ),
    ).toBe("Science");
  });

  it("maps media/net/app top-level categories to their app-taxonomy category", () => {
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "abcde", section: "media-sound" }),
      ),
    ).toBe("Music & Audio");
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "gimp", section: "media-gfx" }),
      ),
    ).toBe("Graphics & Design");
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "hydroxide", section: "net-mail" }),
      ),
    ).toBe("Internet & Communication");
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "ufw", section: "net-firewall" }),
      ),
    ).toBe("Security");
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "xrandr", section: "x11-apps" }),
      ),
    ).toBe("System Tools");
  });

  it("resolves the rest of Portage's taxonomy by family prefix (second wave)", () => {
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "pygments", section: "dev-python" }),
      ),
    ).toBe("Developer Tools");
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "dmidecode", section: "sys-apps" }),
      ),
    ).toBe("System Tools");
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "mosh", section: "net-misc" }),
      ),
    ).toBe("Internet & Communication");
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "qutebrowser", section: "www-client" }),
      ),
    ).toBe("Internet & Communication");
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "atuin", section: "app-shells" }),
      ),
    ).toBe("System Tools");
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "mosquitto", section: "app-misc" }),
      ),
    ).toBe("Utilities");
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "bin2iso", section: "app-cdr" }),
      ),
    ).toBe("Photo & Video");
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "calcurse", section: "app-office" }),
      ),
    ).toBe("Productivity");
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "eureka", section: "games-util" }),
      ),
    ).toBe("System Tools");
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "kalk", section: "kde-apps" }),
      ),
    ).toBe("Settings");
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "dosbox", section: "games-emulation" }),
      ),
    ).toBe("System Tools");
  });

  it("keeps the dev-gap/dev-tex exceptions over the dev- prefix", () => {
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "grape", section: "dev-gap" }),
      ),
    ).toBe("Science");
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "latex2rtf", section: "dev-tex" }),
      ),
    ).toBe("Productivity");
  });

  it("only applies to ebuild-gentoo — other sources reuse the section slot for unrelated vocabularies", () => {
    expect(
      categoryFromGentooSection(
        pkg({ source: "deb-debian", name: "abcde", section: "media-sound" }),
      ),
    ).toBeUndefined();
  });
});

describe("gameGenreFromGentooSection", () => {
  it("maps games-* subcategories to their categories-games.json genre", () => {
    expect(
      gameGenreFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "penguin-command", section: "games-arcade" }),
      ),
    ).toBe("Arcade");
    expect(
      gameGenreFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "wasteland2", section: "games-rpg" }),
      ),
    ).toBe("Role-Playing");
    expect(
      gameGenreFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "nethack", section: "games-roguelike" }),
      ),
    ).toBe("Role-Playing");
    expect(
      gameGenreFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "gnubg", section: "games-board" }),
      ),
    ).toBe("Board & Cards");
  });

  it("folds games-fps into Action, same reasoning as Flathub's own Shooter genre tag", () => {
    expect(
      gameGenreFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "example", section: "games-fps" }),
      ),
    ).toBe("Action");
  });

  it("returns undefined for a games-* subcategory with no clean genre (an emulator isn't itself a game)", () => {
    expect(
      gameGenreFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "dosbox", section: "games-emulation" }),
      ),
    ).toBeUndefined();
  });

  it("only applies to ebuild-gentoo", () => {
    expect(
      gameGenreFromGentooSection(
        pkg({ source: "deb-debian", name: "example", section: "games-arcade" }),
      ),
    ).toBeUndefined();
  });

  it("maps games-puzzle to Puzzle", () => {
    expect(
      gameGenreFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "gnome-sudoku", section: "games-puzzle" }),
      ),
    ).toBe("Puzzle");
  });
});

describe("gameGenreFromSolusSection", () => {
  it("maps games.* PartOf subcategories to their categories-games.json genre", () => {
    expect(
      gameGenreFromSolusSection(
        pkg({ source: "eopkg-solus", name: "yquake2", section: "games.action" }),
      ),
    ).toBe("Action");
    expect(
      gameGenreFromSolusSection(
        pkg({ source: "eopkg-solus", name: "starfighter", section: "games.arcade" }),
      ),
    ).toBe("Arcade");
    expect(
      gameGenreFromSolusSection(
        pkg({ source: "eopkg-solus", name: "openxcom", section: "games.strategy" }),
      ),
    ).toBe("Strategy");
    expect(
      gameGenreFromSolusSection(
        pkg({ source: "eopkg-solus", name: "brogue", section: "games.rpg" }),
      ),
    ).toBe("Role-Playing");
    expect(
      gameGenreFromSolusSection(
        pkg({ source: "eopkg-solus", name: "galois", section: "games.puzzle" }),
      ),
    ).toBe("Puzzle");
    expect(
      gameGenreFromSolusSection(
        pkg({ source: "eopkg-solus", name: "aisleriot-git", section: "games.card" }),
      ),
    ).toBe("Board & Cards");
    expect(
      gameGenreFromSolusSection(
        pkg({ source: "eopkg-solus", name: "tux-math", section: "games.learning" }),
      ),
    ).toBe("Educational");
  });

  it("returns undefined for games.emulator — an emulator isn't itself a game", () => {
    expect(
      gameGenreFromSolusSection(
        pkg({ source: "eopkg-solus", name: "some-emulator", section: "games.emulator" }),
      ),
    ).toBeUndefined();
  });

  it("returns undefined for the two known name exceptions riding an otherwise-clean section", () => {
    expect(
      gameGenreFromSolusSection(
        pkg({ source: "eopkg-solus", name: "pacman-git", section: "games.arcade" }),
      ),
    ).toBeUndefined();
    expect(
      gameGenreFromSolusSection(
        pkg({ source: "eopkg-solus", name: "dfarc", section: "games.rpg" }),
      ),
    ).toBeUndefined();
  });

  it("only applies to eopkg-solus", () => {
    expect(
      gameGenreFromSolusSection(
        pkg({ source: "deb-debian", name: "example", section: "games.arcade" }),
      ),
    ).toBeUndefined();
  });

  it("returns undefined for an absent section", () => {
    expect(
      gameGenreFromSolusSection(
        pkg({ source: "eopkg-solus", name: "example", section: undefined }),
      ),
    ).toBeUndefined();
  });
});

describe("categoryFromOpenSuseGroup", () => {
  it("maps Productivity/Scientific/*, Productivity/Multimedia/Sound/*, and Productivity/Graphics/* by prefix", () => {
    expect(
      categoryFromOpenSuseGroup(
        pkg({
          source: "rpm-opensuse",
          name: "jaxodraw",
          section: "Productivity/Scientific/Physics",
        }),
      ),
    ).toBe("Science");
    expect(
      categoryFromOpenSuseGroup(
        pkg({
          source: "rpm-opensuse",
          name: "shine",
          section: "Productivity/Multimedia/Sound/Utilities",
        }),
      ),
    ).toBe("Music & Audio");
    expect(
      categoryFromOpenSuseGroup(
        pkg({ source: "rpm-opensuse", name: "djvu2pdf", section: "Productivity/Graphics/Other" }),
      ),
    ).toBe("Graphics & Design");
  });

  it("maps exact leaf groups to their app-taxonomy category", () => {
    expect(
      categoryFromOpenSuseGroup(
        pkg({ source: "rpm-opensuse", name: "lldb", section: "Development/Tools/Debuggers" }),
      ),
    ).toBe("Developer Tools");
    expect(
      categoryFromOpenSuseGroup(
        pkg({ source: "rpm-opensuse", name: "clamav-git", section: "Productivity/Security" }),
      ),
    ).toBe("Security");
    expect(
      categoryFromOpenSuseGroup(
        pkg({ source: "rpm-opensuse", name: "wmctrl", section: "System/X11/Utilities" }),
      ),
    ).toBe("System Tools");
  });

  it("does not map Productivity/Text/Spell — dictionary data, excluded separately via filter/rules.ts", () => {
    expect(
      categoryFromOpenSuseGroup(
        pkg({ source: "rpm-opensuse", name: "aspell-ky", section: "Productivity/Text/Spell" }),
      ),
    ).toBeUndefined();
  });

  it("applies to RPM Fusion too — same <rpm:group> vocabulary as openSUSE", () => {
    expect(
      categoryFromOpenSuseGroup(
        pkg({ source: "rpm-rpmfusion", name: "example", section: "Development/Tools/Debuggers" }),
      ),
    ).toBe("Developer Tools");
  });

  it("does not apply to other sources reusing the section slot for unrelated vocabularies", () => {
    expect(
      categoryFromOpenSuseGroup(
        pkg({ source: "deb-debian", name: "example", section: "Development/Tools/Debuggers" }),
      ),
    ).toBeUndefined();
  });

  it("resolves the Development/System/Hardware/Networking namespaces by prefix (second wave), exact entries still winning first", () => {
    expect(
      categoryFromOpenSuseGroup(
        pkg({ source: "rpm-opensuse", name: "icu4j", section: "Development/Libraries/Java" }),
      ),
    ).toBe("Developer Tools");
    expect(
      categoryFromOpenSuseGroup(
        pkg({ source: "rpm-opensuse", name: "rust1.84", section: "Development/Languages/Rust" }),
      ),
    ).toBe("Developer Tools");
    expect(
      categoryFromOpenSuseGroup(
        pkg({ source: "rpm-opensuse", name: "coreutils", section: "System/Base" }),
      ),
    ).toBe("System Tools");
    expect(
      categoryFromOpenSuseGroup(
        pkg({ source: "rpm-opensuse", name: "ckb-next", section: "Hardware/Other" }),
      ),
    ).toBe("System Tools");
    expect(
      categoryFromOpenSuseGroup(
        pkg({ source: "rpm-opensuse", name: "chrony", section: "Productivity/Networking/Other" }),
      ),
    ).toBe("Internet & Communication");
    expect(
      categoryFromOpenSuseGroup(
        pkg({
          source: "rpm-opensuse",
          name: "corosync",
          section: "Productivity/Clustering/HA",
        }),
      ),
    ).toBe("System Tools");
    expect(
      categoryFromOpenSuseGroup(
        pkg({ source: "rpm-opensuse", name: "abook", section: "Productivity/Other" }),
      ),
    ).toBe("Utilities");
    expect(
      categoryFromOpenSuseGroup(
        pkg({ source: "rpm-opensuse", name: "autoyast2", section: "System/YaST" }),
      ),
    ).toBe("Settings");
    expect(
      categoryFromOpenSuseGroup(
        pkg({ source: "rpm-opensuse", name: "phoronix-test-suite", section: "System/Benchmark" }),
      ),
    ).toBe("Developer Tools");
  });

  it("returns undefined for a group that stays deliberately unmapped (Unspecified, Multimedia/Other)", () => {
    expect(
      categoryFromOpenSuseGroup(
        pkg({ source: "rpm-opensuse", name: "edid-decode", section: "Unspecified" }),
      ),
    ).toBeUndefined();
    expect(
      categoryFromOpenSuseGroup(
        pkg({
          source: "rpm-opensuse",
          name: "dvdisaster",
          section: "Productivity/Multimedia/Other",
        }),
      ),
    ).toBeUndefined();
  });
});

describe("categoryFromSolusPartOf", () => {
  it("maps multimedia.audio/multimedia.video/office.scientific/security to their app-taxonomy category", () => {
    expect(
      categoryFromSolusPartOf(
        pkg({ source: "eopkg-solus", name: "decibels", section: "multimedia.audio" }),
      ),
    ).toBe("Music & Audio");
    expect(
      categoryFromSolusPartOf(
        pkg({ source: "eopkg-solus", name: "cinelerra-gg", section: "multimedia.video" }),
      ),
    ).toBe("Photo & Video");
    expect(
      categoryFromSolusPartOf(
        pkg({ source: "eopkg-solus", name: "yosys", section: "office.scientific" }),
      ),
    ).toBe("Science");
    expect(
      categoryFromSolusPartOf(
        pkg({ source: "eopkg-solus", name: "usbguard", section: "security" }),
      ),
    ).toBe("Security");
  });

  it("only applies to eopkg-solus — other sources reuse the section slot for unrelated vocabularies", () => {
    expect(
      categoryFromSolusPartOf(pkg({ source: "deb-debian", name: "example", section: "security" })),
    ).toBeUndefined();
  });

  it("returns undefined for an unmapped PartOf value (e.g. bare office, too mixed with a 3D-printer slicer and spell-check data)", () => {
    expect(
      categoryFromSolusPartOf(pkg({ source: "eopkg-solus", name: "cura", section: "office" })),
    ).toBeUndefined();
  });

  it("returns undefined for an absent section", () => {
    expect(
      categoryFromSolusPartOf(pkg({ source: "eopkg-solus", name: "example", section: undefined })),
    ).toBeUndefined();
  });
});

describe("categoryFromSlackwareSeries", () => {
  it("maps Slackware's package series to their app-taxonomy category", () => {
    expect(
      categoryFromSlackwareSeries(
        pkg({ source: "slackware", name: "bcachefs-tools", section: "a" }),
      ),
    ).toBe("System Tools");
    expect(
      categoryFromSlackwareSeries(pkg({ source: "slackware", name: "ghostscript", section: "ap" })),
    ).toBe("Utilities");
    expect(
      categoryFromSlackwareSeries(pkg({ source: "slackware", name: "automake", section: "d" })),
    ).toBe("Developer Tools");
    expect(
      categoryFromSlackwareSeries(pkg({ source: "slackware", name: "emacs", section: "e" })),
    ).toBe("Utilities");
    expect(
      categoryFromSlackwareSeries(pkg({ source: "slackware", name: "man-pages", section: "f" })),
    ).toBe("Books & Reference");
    expect(
      categoryFromSlackwareSeries(pkg({ source: "slackware", name: "mosh", section: "n" })),
    ).toBe("Internet & Communication");
    expect(
      categoryFromSlackwareSeries(pkg({ source: "slackware", name: "texinfo", section: "t" })),
    ).toBe("Productivity");
    expect(
      categoryFromSlackwareSeries(pkg({ source: "slackware", name: "expect", section: "tcl" })),
    ).toBe("Developer Tools");
    expect(
      categoryFromSlackwareSeries(pkg({ source: "slackware", name: "lndir", section: "x" })),
    ).toBe("System Tools");
    expect(
      categoryFromSlackwareSeries(pkg({ source: "slackware", name: "kalk", section: "kde" })),
    ).toBe("Settings");
  });

  it("returns undefined for the deliberately unmapped series (xap — too mixed, y — game detection's job)", () => {
    expect(
      categoryFromSlackwareSeries(pkg({ source: "slackware", name: "gparted", section: "xap" })),
    ).toBeUndefined();
    expect(
      categoryFromSlackwareSeries(pkg({ source: "slackware", name: "doom", section: "y" })),
    ).toBeUndefined();
  });

  it("only applies to slackware", () => {
    expect(
      categoryFromSlackwareSeries(pkg({ source: "deb-debian", name: "bash", section: "a" })),
    ).toBeUndefined();
  });

  it("returns undefined for an absent section", () => {
    expect(
      categoryFromSlackwareSeries(
        pkg({ source: "slackware", name: "example", section: undefined }),
      ),
    ).toBeUndefined();
  });
});

describe("categoryFromNixScope", () => {
  it("maps nixpkgs' attribute-path scopes to their app-taxonomy category", () => {
    expect(
      categoryFromNixScope(pkg({ source: "nix-nixpkgs", name: "kalk", section: "kdePackages" })),
    ).toBe("Settings");
    expect(
      categoryFromNixScope(pkg({ source: "nix-nixpkgs", name: "wordnet", section: "nltk-data" })),
    ).toBe("Science");
    expect(
      categoryFromNixScope(
        pkg({ source: "nix-nixpkgs", name: "mathcomp-algebra", section: "coqPackages" }),
      ),
    ).toBe("Science");
    expect(
      categoryFromNixScope(
        pkg({ source: "nix-nixpkgs", name: "symbolic", section: "octavePackages" }),
      ),
    ).toBe("Science");
    expect(
      categoryFromNixScope(
        pkg({ source: "nix-nixpkgs", name: "MapleMono-CN", section: "maple-mono" }),
      ),
    ).toBe("Graphics & Design");
    expect(
      categoryFromNixScope(
        pkg({ source: "nix-nixpkgs", name: "skk-jisyo-edict", section: "skkDictionaries" }),
      ),
    ).toBe("Books & Reference");
    expect(
      categoryFromNixScope(
        pkg({ source: "nix-nixpkgs", name: "webtorrent-mpv-hook", section: "mpvScripts" }),
      ),
    ).toBe("Photo & Video");
    expect(
      categoryFromNixScope(pkg({ source: "nix-nixpkgs", name: "autofs", section: "freebsd" })),
    ).toBe("System Tools");
    expect(
      categoryFromNixScope(pkg({ source: "nix-nixpkgs", name: "sts", section: "nginxModules" })),
    ).toBe("Internet & Communication");
    expect(
      categoryFromNixScope(
        pkg({
          source: "nix-nixpkgs",
          name: "toreamun/amshan",
          section: "home-assistant-custom-components",
        }),
      ),
    ).toBe("System Tools");
    expect(
      categoryFromNixScope(
        pkg({ source: "nix-nixpkgs", name: "fennel", section: "luajitPackages" }),
      ),
    ).toBe("Developer Tools");
    expect(
      categoryFromNixScope(pkg({ source: "nix-nixpkgs", name: "lld", section: "llvmPackages_20" })),
    ).toBe("Developer Tools");
  });

  it("returns undefined for scopes with no coherent category (openraPackages, odd one-offs)", () => {
    expect(
      categoryFromNixScope(
        pkg({ source: "nix-nixpkgs", name: "openra-td", section: "openraPackages_2019" }),
      ),
    ).toBeUndefined();
    expect(
      categoryFromNixScope(
        pkg({ source: "nix-nixpkgs", name: "example", section: "example-scope" }),
      ),
    ).toBeUndefined();
  });

  it("only applies to nix-nixpkgs", () => {
    expect(
      categoryFromNixScope(pkg({ source: "deb-debian", name: "example", section: "kdePackages" })),
    ).toBeUndefined();
  });

  it("returns undefined for an absent section", () => {
    expect(
      categoryFromNixScope(pkg({ source: "nix-nixpkgs", name: "example", section: undefined })),
    ).toBeUndefined();
  });
});
