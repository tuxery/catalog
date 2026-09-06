import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "../../sources";
import { computeDataConfidence, forceMatchedKeys } from "./data-confidence";

function pkg(overrides: Partial<SourcedPackage> & Pick<SourcedPackage, "source" | "name">): SourcedPackage {
  return { description: "", version: "1.0", ...overrides };
}

describe("computeDataConfidence", () => {
  it("stays at the neutral baseline for a single-source app — nothing to cross-check", () => {
    const packages = [pkg({ source: "flatpak-flathub", name: "Firefox" })];
    expect(computeDataConfidence(packages, new Set())).toEqual({ score: 0, signals: [] });
  });

  it("rewards a multi-source app whose members fully agree", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Firefox", license: "MPL-2.0" }),
      pkg({ source: "snap-snapcraft", name: "Firefox", license: "MPL2" }),
    ];
    const result = computeDataConfidence(packages, new Set());
    expect(result.score).toBe(10);
    expect(result.signals).toEqual([
      {
        signal: "multi-source-corroboration",
        delta: 10,
        detail: "2 independent sources agree, no disagreement signal found.",
      },
    ]);
  });

  it("does not flag AUR's own build-variant suffix convention as a name disagreement (real case: Jan)", () => {
    const packages = [
      pkg({ source: "pacman-aur", name: "jan" }),
      pkg({ source: "pacman-aur", name: "jan-bin" }),
      pkg({ source: "pacman-aur", name: "jan-git" }),
    ];
    const result = computeDataConfidence(packages, new Set());
    expect(result.signals.some((s) => s.signal === "name-disagreement")).toBe(false);
  });

  it("penalizes a real name disagreement between member packages", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Zen Browser" }),
      pkg({ source: "pacman-aur", name: "Zen" }),
    ];
    const result = computeDataConfidence(packages, new Set());
    expect(result.signals.some((s) => s.signal === "name-disagreement")).toBe(true);
    expect(result.score).toBeLessThan(0);
  });

  it("penalizes a real license family conflict, distinct from notation drift", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Yubico Authenticator", license: "BSD-2-Clause" }),
      pkg({ source: "pacman-aur", name: "Yubico Authenticator", license: "Apache-2.0" }),
    ];
    const result = computeDataConfidence(packages, new Set());
    expect(result.signals.some((s) => s.signal === "license-family-conflict")).toBe(true);
    expect(result.score).toBeLessThan(0);
  });

  it("does not flag license notation drift (GPL vs GPL-3.0-or-later) as a conflict", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Alligator", license: "GPL" }),
      pkg({ source: "pacman-aur", name: "Alligator", license: "GPL-3.0-or-later" }),
    ];
    const result = computeDataConfidence(packages, new Set());
    expect(result.signals.some((s) => s.signal === "license-family-conflict")).toBe(false);
  });

  it("rewards a force-matched app regardless of other signals", () => {
    const packages = [pkg({ source: "flatpak-flathub", name: "Firefox", appId: "org.mozilla.firefox" })];
    const forceKeys = new Set(["flatpak-flathub:org.mozilla.firefox"]);
    const result = computeDataConfidence(packages, forceKeys);
    expect(result.signals).toEqual([
      {
        signal: "force-match-verified",
        delta: 30,
        detail: "This merge is listed in config/match-force.json — a human already verified it.",
      },
    ]);
  });

  it("nets independent signals together rather than only ever applying one", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Flow", appId: "app.flow", license: "GPL-3.0-only" }),
      pkg({ source: "pacman-aur", name: "Flow", license: "MIT" }),
    ];
    const forceKeys = new Set(["flatpak-flathub:app.flow"]);
    const result = computeDataConfidence(packages, forceKeys);
    // Force-match verified (+30) and a real license conflict (-20) can both
    // be true about the same app at once — the corroboration bonus doesn't
    // fire alongside the conflict (names agree but licenses don't), so the
    // net is exactly the sum of those two.
    expect(result.score).toBe(10);
    expect(result.signals.map((s) => s.signal)).toEqual([
      "force-match-verified",
      "license-family-conflict",
    ]);
  });
});

describe("forceMatchedKeys", () => {
  it("collects both the destination and every source ref from every force entry", () => {
    const overrides = {
      force: [
        {
          destination: { source: "flatpak-flathub", appId: "org.libreoffice.LibreOffice" },
          sources: [
            { source: "deb-debian", appId: "libreoffice" },
            { source: "rpm-fedora", appId: "libreoffice" },
          ],
          reason: "test",
        },
      ],
      denyPairs: new Set<string>(),
    };
    expect(forceMatchedKeys(overrides)).toEqual(
      new Set([
        "flatpak-flathub:org.libreoffice.LibreOffice",
        "deb-debian:libreoffice",
        "rpm-fedora:libreoffice",
      ]),
    );
  });
});
