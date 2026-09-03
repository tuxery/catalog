import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "../../sources";
import {
  categoryFromDebianSection,
  categoryFromGentooSection,
  categoryFromOpenSuseGroup,
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

  it("returns undefined for an unmapped section (e.g. games, or one not in the GUI-predictive set)", () => {
    expect(categoryFromDebianSection(pkg({ name: "0ad", section: "games" }))).toBeUndefined();
    expect(categoryFromDebianSection(pkg({ name: "example", section: "devel" }))).toBeUndefined();
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

  it("only applies to ebuild-gentoo — other sources reuse the section slot for unrelated vocabularies", () => {
    expect(
      categoryFromGentooSection(
        pkg({ source: "deb-debian", name: "abcde", section: "media-sound" }),
      ),
    ).toBeUndefined();
  });

  it("returns undefined for an unmapped section (e.g. dev-python, too mixed with libraries to trust)", () => {
    expect(
      categoryFromGentooSection(
        pkg({ source: "ebuild-gentoo", name: "example", section: "dev-python" }),
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
      gameGenreFromSolusSection(pkg({ source: "eopkg-solus", name: "brogue", section: "games.rpg" })),
    ).toBe("Role-Playing");
    expect(
      gameGenreFromSolusSection(pkg({ source: "eopkg-solus", name: "galois", section: "games.puzzle" })),
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
      gameGenreFromSolusSection(pkg({ source: "eopkg-solus", name: "pacman-git", section: "games.arcade" })),
    ).toBeUndefined();
    expect(
      gameGenreFromSolusSection(pkg({ source: "eopkg-solus", name: "dfarc", section: "games.rpg" })),
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
      gameGenreFromSolusSection(pkg({ source: "eopkg-solus", name: "example", section: undefined })),
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

  it("returns undefined for an unmapped group (e.g. Development/Languages/Python, too mixed with libraries)", () => {
    expect(
      categoryFromOpenSuseGroup(
        pkg({
          source: "rpm-opensuse",
          name: "example",
          section: "Development/Languages/Python",
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
      categoryFromSolusPartOf(pkg({ source: "eopkg-solus", name: "yosys", section: "office.scientific" })),
    ).toBe("Science");
    expect(
      categoryFromSolusPartOf(pkg({ source: "eopkg-solus", name: "usbguard", section: "security" })),
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
