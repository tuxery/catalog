import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "@tuxery/sources";
import { MATCH_WEIGHTS, scoreMatch } from "./score";

function pkg(overrides: Partial<SourcedPackage>): SourcedPackage {
  return {
    source: "flatpak-flathub",
    name: "Example",
    description: "",
    version: "1.0.0",
    ...overrides,
  };
}

describe("scoreMatch", () => {
  it("scores identical packages as 1", () => {
    const a = pkg({ name: "Firefox", appId: "org.mozilla.firefox", iconFilename: "firefox.png" });
    const b = pkg({ name: "Firefox", appId: "org.mozilla.firefox", iconFilename: "firefox.png" });

    expect(scoreMatch(a, b)).toBe(1);
  });

  it("scores completely unrelated packages as 0", () => {
    const a = pkg({ name: "aaaa", appId: "org.example.a", iconFilename: "a.png" });
    const b = pkg({ name: "zzzz", appId: "org.example.z", iconFilename: "z.png" });

    expect(scoreMatch(a, b)).toBe(0);
  });

  it("weighs an exact appId match at MATCH_WEIGHTS.appId, independent of name", () => {
    const a = pkg({ name: "aaaa", appId: "shared-id" });
    const b = pkg({ name: "zzzz", appId: "shared-id" });

    expect(scoreMatch(a, b)).toBeCloseTo(MATCH_WEIGHTS.appId, 10);
  });

  it("weighs an exact icon filename match at MATCH_WEIGHTS.iconFilename, independent of name", () => {
    const a = pkg({ name: "aaaa", iconFilename: "shared.png" });
    const b = pkg({ name: "zzzz", iconFilename: "shared.png" });

    expect(scoreMatch(a, b)).toBeCloseTo(MATCH_WEIGHTS.iconFilename, 10);
  });

  it("never reaches a typical 0.75 threshold without an exact appId or exact name match", () => {
    // Best case without either signal: near-identical names plus a shared icon.
    const a = pkg({ name: "Firefo", iconFilename: "shared.png" });
    const b = pkg({ name: "Firefox", iconFilename: "shared.png" });

    expect(scoreMatch(a, b)).toBeLessThan(0.75);
  });
});
