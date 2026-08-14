import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "@tuxery/sources";
import { groupPackages } from "./group";

function pkg(overrides: Partial<SourcedPackage>): SourcedPackage {
  return {
    source: "flathub",
    name: "Example",
    description: "",
    version: "1.0.0",
    ...overrides,
  };
}

describe("groupPackages", () => {
  it("groups packages with the same appId across sources", () => {
    const packages = [
      pkg({ source: "flathub", name: "Discord", appId: "com.discordapp.Discord" }),
      pkg({ source: "snapcraft", name: "Discord", appId: "com.discordapp.Discord" }),
    ];

    const groups = groupPackages(packages);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.packages).toHaveLength(2);
  });

  it("keeps unrelated packages in separate groups", () => {
    const packages = [
      pkg({ source: "flathub", name: "Discord", appId: "com.discordapp.Discord" }),
      pkg({ source: "flathub", name: "Spotify", appId: "com.spotify.Client" }),
    ];

    const groups = groupPackages(packages);

    expect(groups).toHaveLength(2);
  });

  it("still buckets together (and matches) when names differ in case/punctuation", () => {
    const packages = [
      pkg({ source: "flathub", name: "GIMP", appId: "org.gimp.GIMP" }),
      pkg({ source: "snapcraft", name: "gimp", appId: "org.gimp.GIMP" }),
    ];

    // Same appId alone isn't enough to clear the threshold (0.35 of 0.75) —
    // this only passes if bucketKey() also normalizes case, so both land in
    // bucket "gi" and get compared at all.
    expect(groupPackages(packages)).toHaveLength(1);
  });

  it("never compares packages across buckets, even if they'd otherwise match — the known trade-off for tractability at scale", () => {
    const packages = [
      // Same underlying app, named differently enough that the 2-char
      // normalized prefix ("vs" vs "vi") puts them in different buckets.
      pkg({ source: "flathub", name: "vscode", appId: "com.visualstudio.code" }),
      pkg({ source: "snapcraft", name: "visual-studio-code", appId: "com.visualstudio.code" }),
    ];

    // Would be 1 group with a naive full pairwise scan (matching appId) —
    // documenting the miss, not asserting it's desirable.
    expect(groupPackages(packages)).toHaveLength(2);
  });
});
