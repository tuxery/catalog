import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { LutrisCacheEntry } from "./types";

describe("lutris normalize", () => {
  it("maps a cache entry to a SourcedPackage", () => {
    const entry: LutrisCacheEntry = {
      gameId: 4713,
      gameSlug: "rollercoaster-tycoon-2",
      name: "RollerCoaster Tycoon 2",
      description: 'Play "RollerCoaster Tycoon 2" CD edition on Linux!',
    };

    expect(normalize([entry])).toEqual([
      {
        source: "lutris",
        name: "RollerCoaster Tycoon 2",
        description: 'Play "RollerCoaster Tycoon 2" CD edition on Linux!',
        version: "unknown",
        appId: "rollercoaster-tycoon-2",
        homepage: "https://lutris.net/games/rollercoaster-tycoon-2/",
      },
    ]);
  });

  it("never sets hasGameCategory — real bug, found live: Lutris hosts real non-game installers too (Discord), and neither of its APIs carries a genre signal to tell them apart", () => {
    const entry: LutrisCacheEntry = {
      gameId: 1,
      gameSlug: "app",
      name: "App",
      description: "",
    };

    expect(normalize([entry])[0]?.hasGameCategory).toBeUndefined();
  });

  it("builds the homepage from the game slug", () => {
    const entry: LutrisCacheEntry = {
      gameId: 1,
      gameSlug: "harvest-moon-64",
      name: "Harvest Moon 64",
      description: "",
    };

    expect(normalize([entry])[0]?.homepage).toBe("https://lutris.net/games/harvest-moon-64/");
  });
});
