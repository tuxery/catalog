import { describe, expect, it } from "vitest";
import { nameAxes } from "./name-axes";

describe("nameAxes", () => {
  it("reads VCS suffixes as the git risk", () => {
    expect(nameAxes("0xtools-git")).toEqual({ risk: "git" });
    expect(nameAxes("foo-svn")).toEqual({ risk: "git" });
  });

  it("reads -bin and -appimage as flavors", () => {
    expect(nameAxes("zen-browser-bin")).toEqual({ flavors: ["bin"] });
    expect(nameAxes("obsidian-appimage")).toEqual({ flavors: ["appimage"] });
  });

  it("combines a risk word with a build flavor", () => {
    expect(nameAxes("brave-origin-beta-bin")).toEqual({ risk: "beta", flavors: ["bin"] });
    expect(nameAxes("firefox-nightly")).toEqual({ risk: "nightly" });
  });

  it("lets a VCS token win over a risk word", () => {
    expect(nameAxes("foo-beta-git")).toEqual({ risk: "git" });
  });

  it("stops at the first token that isn't a build token", () => {
    expect(nameAxes("firefox-nightly-de-bin")).toEqual({ flavors: ["bin"] });
  });

  it("never reads the first token, nor -dev", () => {
    expect(nameAxes("git")).toEqual({});
    expect(nameAxes("bin")).toEqual({});
    expect(nameAxes("libfoo-dev")).toEqual({});
  });
});
