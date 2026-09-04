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
      genres: [],
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

  it("maps IGDB genres to game categories and sets hasGameCategory", () => {
    const entry: LutrisCacheEntry = {
      gameId: 16467,
      gameSlug: "dusk",
      installerSlug: "dusk-gog",
      name: "DUSK",
      description: "An installer for the GOG version of the game.",
      genres: ["FPS"],
    };

    expect(normalize([entry])[0]).toMatchObject({
      hasGameCategory: true,
      categories: ["Shooter"],
    });
  });

  it("prefers the game's real description over the installer's one-liner", () => {
    const entry: LutrisCacheEntry = {
      gameId: 16467,
      gameSlug: "dusk",
      installerSlug: "dusk-gog",
      name: "DUSK",
      description: "An installer for the GOG version of the game.",
      genres: ["FPS"],
      gameDescription: "Battle through an onslaught of mystical backwater cultists...",
    };

    expect(normalize([entry])[0]?.description).toBe(
      "Battle through an onslaught of mystical backwater cultists...",
    );
  });

  it("leaves hasGameCategory and categories unset when a game has no genres", () => {
    const entry: LutrisCacheEntry = {
      gameId: 1,
      gameSlug: "app",
      installerSlug: "app-native",
      name: "App",
      description: "",
      genres: [],
    };

    expect(normalize([entry])[0]?.hasGameCategory).toBeUndefined();
    expect(normalize([entry])[0]?.categories).toBeUndefined();
  });

  it("builds the homepage from the game slug, not the installer slug", () => {
    const entry: LutrisCacheEntry = {
      gameId: 1,
      gameSlug: "harvest-moon-64",
      installerSlug: "harvest-moon-64-n64-emu",
      name: "Harvest Moon 64",
      description: "",
      genres: [],
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
      genres: [],
    };

    expect(normalize([entry])[0]?.channel).toBeUndefined();
  });
});
