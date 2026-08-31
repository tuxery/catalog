import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "../../sources";
import {
  categoryFromDebianSection,
  categoryFromGentooSection,
  gameGenreFromGentooSection,
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
});
