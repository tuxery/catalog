import { describe, expect, it } from "vitest";
import { loadMatchOverrides } from "./overrides";

describe("loadMatchOverrides", () => {
  it("reads the real override files without throwing", () => {
    const overrides = loadMatchOverrides();

    expect(overrides.manual).toEqual([]);
    expect(overrides.denyPairs).toBeInstanceOf(Set);
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
