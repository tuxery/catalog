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
});
