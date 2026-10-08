import { describe, expect, it } from "vitest";
import { axesFromRest, describesTarget, isVariantRest, restAfter } from "./variants";

describe("isVariantRest", () => {
  it("accepts build options and patch sets", () => {
    expect(isVariantRest(["vaapi"])).toBe(true);
    expect(isVariantRest(["smooth", "cursor"])).toBe(true);
  });

  it("rejects forks, shims and language packs", () => {
    expect(isVariantRest(["ng"])).toBe(false);
    expect(isVariantRest(["firefox", "symlink", "latest"])).toBe(false);
    expect(isVariantRest(["i18n", "fr"])).toBe(false);
    expect(isVariantRest(["rs"])).toBe(false);
    expect(isVariantRest([])).toBe(false);
  });
});

describe("axesFromRest", () => {
  it("reads tracks, risks and locales, keeping the rest as one flavor", () => {
    expect(axesFromRest(["esr", "zh"])).toEqual({ track: "esr", flavors: ["locale:zh"] });
    expect(axesFromRest(["develop"])).toEqual({ risk: "git" });
    expect(axesFromRest(["no", "notmuch"])).toEqual({ flavors: ["no-notmuch"] });
    expect(axesFromRest(["vaapi"])).toEqual({ flavors: ["vaapi"] });
    expect(axesFromRest(["insiders"])).toEqual({ risk: "nightly" });
  });

  it("reads version numbers as a track, joined with a track word", () => {
    expect(axesFromRest(["1.31"])).toEqual({ track: "1.31" });
    expect(axesFromRest(["lts", "22"])).toEqual({ track: "lts-22" });
  });

  it("treats stable as the default, not a flavor", () => {
    expect(axesFromRest(["stable"])).toEqual({});
  });
});

describe("restAfter", () => {
  it("splits what follows the base name", () => {
    expect(restAfter("firefox-esr-zh", "firefox")).toEqual(["esr", "zh"]);
    expect(restAfter("firefoxpwa", "firefox")).toBeUndefined();
  });
});

describe("describesTarget", () => {
  it("accepts a description naming the target or sharing a significant word", () => {
    expect(
      describesTarget("Firefox with VA-API patches", "firefox", "Standalone web browser"),
    ).toBe(true);
    expect(
      describesTarget(
        "Fast, Private & Safe Web Browser (patched)",
        "firefox",
        "Fast, Private & Safe Web Browser",
      ),
    ).toBe(true);
  });

  it("rejects unrelated software whose files merely collide", () => {
    expect(
      describesTarget("A C compiler for 8-bit CPUs", "ack", "A Perl-based grep replacement"),
    ).toBe(false);
  });
});
