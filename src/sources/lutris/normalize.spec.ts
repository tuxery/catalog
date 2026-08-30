import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { LutrisCacheEntry } from "./types";

describe("lutris normalize", () => {
  it("maps a cache entry to a SourcedPackage", () => {
    const entry: LutrisCacheEntry = {
      gameId: 4713,
      gameSlug: "rollercoaster-tycoon-2",
      installerSlug: "rollercoaster-tycoon-2-cd",
      name: "RollerCoaster Tycoon 2",
      description: 'Play "RollerCoaster Tycoon 2" CD edition on Linux!',
      version: "CD",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "lutris",
        name: "RollerCoaster Tycoon 2",
        description: 'Play "RollerCoaster Tycoon 2" CD edition on Linux!',
        version: "unknown",
        appId: "rollercoaster-tycoon-2-cd",
        homepage: "https://lutris.net/games/rollercoaster-tycoon-2/",
        channel: "CD",
      },
    ]);
  });

  it("never sets hasGameCategory — real bug, found live: Lutris hosts real non-game installers too (Discord), and neither of its APIs carries a genre signal to tell them apart", () => {
    const entry: LutrisCacheEntry = {
      gameId: 1,
      gameSlug: "app",
      installerSlug: "app-native",
      name: "App",
      description: "",
    };

    expect(normalize([entry])[0]?.hasGameCategory).toBeUndefined();
  });

  it("builds the homepage from the game slug, not the installer slug", () => {
    const entry: LutrisCacheEntry = {
      gameId: 1,
      gameSlug: "harvest-moon-64",
      installerSlug: "harvest-moon-64-n64-emu",
      name: "Harvest Moon 64",
      description: "",
    };

    expect(normalize([entry])[0]?.homepage).toBe("https://lutris.net/games/harvest-moon-64/");
  });

  it("leaves channel undefined when the installer has no version label", () => {
    const entry: LutrisCacheEntry = {
      gameId: 1,
      gameSlug: "a",
      installerSlug: "a-native",
      name: "A",
      description: "",
    };

    expect(normalize([entry])[0]?.channel).toBeUndefined();
  });
});
