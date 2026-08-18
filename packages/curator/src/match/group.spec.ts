import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "@tuxery/sources";
import { groupPackages } from "./group";
import type { MatchOverrides } from "./overrides";

function pkg(overrides: Partial<SourcedPackage>): SourcedPackage {
  return {
    source: "flatpak-flathub",
    name: "Example",
    description: "",
    version: "1.0.0",
    ...overrides,
  };
}

const NO_OVERRIDES: MatchOverrides = { manual: [], denyPairs: new Set() };

describe("groupPackages", () => {
  it("groups packages with the same appId across sources (tier 1: exact appId)", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Discord", appId: "com.discordapp.Discord" }),
      pkg({ source: "snap-snapcraft", name: "Discord", appId: "com.discordapp.Discord" }),
    ];

    const groups = groupPackages(packages, NO_OVERRIDES);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.packages).toHaveLength(2);
  });

  it("keeps unrelated packages in separate groups", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Discord", appId: "com.discordapp.Discord" }),
      pkg({ source: "flatpak-flathub", name: "Spotify", appId: "com.spotify.Client" }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(2);
  });

  it("groups packages with the same normalized name but different/no appId (tier 2: exact name)", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "GIMP", appId: "org.gimp.GIMP" }),
      pkg({ source: "pacman-aur", name: "gimp", appId: undefined }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(1);
  });

  it("unions on appId even when names are completely different — appId is a stronger signal than name similarity", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "vscode", appId: "com.visualstudio.code" }),
      pkg({ source: "snap-snapcraft", name: "visual-studio-code", appId: "com.visualstudio.code" }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(1);
  });

  it("does not merge packages with neither a shared appId nor a shared normalized name", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "vscode", appId: "com.visualstudio.code" }),
      pkg({ source: "snap-snapcraft", name: "visual-studio-code", appId: "different-app-id" }),
    ];

    // No fuzzy/scored fallback — see group.ts's doc comment for why a
    // scored tier could never fire here anyway given the current weights.
    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(2);
  });

  it("tier 0: manual overrides force a union regardless of appId/name", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Totally Different Name", appId: "org.example.a" }),
      pkg({
        source: "pacman-aur",
        name: "unrelated-looking-name",
        appId: "unrelated-looking-name",
      }),
    ];
    const overrides: MatchOverrides = {
      manual: [
        {
          a: { source: "flatpak-flathub", appId: "org.example.a" },
          b: { source: "pacman-aur", appId: "unrelated-looking-name" },
          reason: "test: manually confirmed same app under very different names",
        },
      ],
      denyPairs: new Set(),
    };

    expect(groupPackages(packages, overrides)).toHaveLength(1);
  });

  it("deny overrides block an otherwise-exact appId match", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Ambiguous", appId: "shared-id" }),
      pkg({ source: "pacman-aur", name: "Ambiguous", appId: "shared-id" }),
    ];
    const overrides: MatchOverrides = {
      manual: [],
      denyPairs: new Set(["flatpak-flathub:shared-id|pacman-aur:shared-id"]),
    };

    expect(groupPackages(packages, overrides)).toHaveLength(2);
  });

  it("does not union generic-name-blocklisted names on name alone (tier 2 is skipped for them)", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Calculator", appId: "org.gnome.Calculator" }),
      pkg({ source: "flatpak-flathub", name: "Calculator", appId: "org.kde.kalk" }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(2);
  });

  it("still unions a blocklisted name via tier 1 (exact appId) when appId genuinely matches", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Calculator", appId: "org.gnome.Calculator" }),
      pkg({ source: "snap-snapcraft", name: "gnome-calculator", appId: "org.gnome.Calculator" }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(1);
  });

  it("does not union on appId alone when the appId itself is a blocklisted generic word (tier 1 gap fix)", () => {
    // Bare-package-name sources (AUR, Fedora, ...) set appId to the
    // literal package name — two unrelated tools both literally named
    // "weather" would previously union on that shared appId with zero
    // defense, the exact gap tier 2's blocklist already closed for names.
    const packages = [
      pkg({ source: "pacman-aur", name: "weather", appId: "weather" }),
      pkg({ source: "rpm-fedora", name: "weather", appId: "weather" }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(2);
  });

  it("blocklists a bare appId case-insensitively, same normalization tier 2 already uses for names", () => {
    const packages = [
      pkg({ source: "pacman-aur", name: "Clock", appId: "Clock" }),
      pkg({ source: "rpm-fedora", name: "clock", appId: "clock" }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(2);
  });

  it("still unions non-blocklisted bare appIds via tier 1 as normal", () => {
    const packages = [
      pkg({ source: "pacman-aur", name: "firefox", appId: "firefox" }),
      pkg({ source: "rpm-fedora", name: "firefox", appId: "firefox" }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(1);
  });

  it("uses the real (currently empty) override files when none are passed", () => {
    const packages = [pkg({ source: "flatpak-flathub", name: "Solo", appId: "org.example.solo" })];

    expect(groupPackages(packages)).toHaveLength(1);
  });
});
