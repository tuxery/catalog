import { describe, expect, it } from "vitest";
import { loadMatchOverrides } from "./overrides";

describe("loadMatchOverrides", () => {
  it("reads the real override files without throwing", () => {
    const overrides = loadMatchOverrides();

    expect(Array.isArray(overrides.manual)).toBe(true);
    expect(overrides.denyPairs).toBeInstanceOf(Set);
  });

  it("forces the real Zen Browser merge (Flathub's short name vs AUR's zen-browser family)", () => {
    // Regression guard: see group.ts's GENERIC_NAME_BLOCKLIST comment on
    // "zen" for the two bugs (a false merge and a false split) this
    // bridges — a name-pattern fix alone couldn't close this one.
    const overrides = loadMatchOverrides();

    expect(overrides.manual).toContainEqual(
      expect.objectContaining({
        a: { source: "flatpak-flathub", appId: "app.zen_browser.zen" },
        b: { source: "pacman-aur", appId: "zen-browser" },
      }),
    );
  });

  it("denies the real pCloud Drive / AUR pcloud-drive false-merge", () => {
    // Regression guard: these two normalize to the same name
    // ("pclouddrive") but are genuinely different software — see
    // deny-matches.ndjson's own reason.
    const overrides = loadMatchOverrides();

    expect(overrides.denyPairs.has("appimage-manual:pCloud Drive|pacman-aur:pcloud-drive")).toBe(
      true,
    );
  });
});
