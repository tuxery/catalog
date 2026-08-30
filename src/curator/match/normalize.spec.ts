import { describe, expect, it } from "vitest";
import { normalizeName } from "./normalize";

describe("normalizeName", () => {
  it("lowercases and strips non-alphanumeric characters", () => {
    expect(normalizeName("Firefox")).toBe("firefox");
    expect(normalizeName("Zen Browser")).toBe("zenbrowser");
    expect(normalizeName("zen-browser")).toBe("zenbrowser");
  });

  it("transliterates diacritics instead of dropping them — real bug, found live: a plain strip silently split real apps into two catalog entries whenever one source spelled the name with its proper accent and another used the plain-ASCII form", () => {
    // The real case that prompted this: the LÖVE game engine (Flathub,
    // Lutris) vs. "love" (12 other sources, including AUR/Debian/Arch)
    // resolved to different keys ("lve" vs "love") and never merged.
    expect(normalizeName("LÖVE")).toBe("love");
    expect(normalizeName("Touché")).toBe("touche");
    expect(normalizeName("Protégé")).toBe("protege");
  });

  it('resolves the trademark symbol to its NFKD compatibility decomposition ("TM"), not a special case coded here', () => {
    expect(normalizeName("EVERSPACE™")).toBe("everspacetm");
  });

  it("leaves plain ASCII names unaffected by the diacritic pass", () => {
    expect(normalizeName("hello world")).toBe("helloworld");
  });
});
