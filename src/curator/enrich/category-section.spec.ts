import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "../../sources";
import { categoryFromDebianSection } from "./category-section";

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
