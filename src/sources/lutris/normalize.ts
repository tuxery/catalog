import type { SourcedPackage } from "../types";
import type { LutrisCacheEntry } from "./types";

// Lutris's `/api/games/<slug>` `genres` names (IGDB-sourced, human-readable
// rather than slugs) mapped to the closest freedesktop.org Additional
// Category key — the same vocabulary every other source's genre signal
// already feeds through `pickCategory`, and the same mapping discipline as
// GOG's own genre-slug table (`gog/normalize.ts`). Deliberately NOT mapped,
// checked against IGDB's own vocabulary: "Indie"/"Music" (not a genre /
// no Music genre in the 10-value taxonomy), "Racing" (a real genre with no
// home in the taxonomy — see `enrich/category.ts`'s own comment on
// Casino/Casual/Music/Racing/Trivia/Word), and "Sandbox" (a theme, not a
// genre). "FPS"/"Shooter" fold into "Shooter" (→ Action, like GOG);
// "Metroidvania" folds into "ActionGame" (same as GOG); "Construction"/
// "Management" fold into "Simulation" (building/management sims).
const IGDB_GENRE_TO_CATEGORY: Record<string, string> = {
  action: "ActionGame",
  fighting: "ActionGame",
  "hack and slash/beat 'em up": "ActionGame",
  metroidvania: "ActionGame",
  shooter: "Shooter",
  fps: "Shooter",
  platform: "ArcadeGame",
  arcade: "ArcadeGame",
  pinball: "ArcadeGame",
  adventure: "AdventureGame",
  "point-and-click": "AdventureGame",
  "visual novel": "AdventureGame",
  puzzle: "LogicGame",
  "quiz/trivia": "LogicGame",
  "role-playing (rpg)": "RolePlaying",
  rpg: "RolePlaying",
  roguelike: "RolePlaying",
  simulator: "Simulation",
  simulation: "Simulation",
  construction: "Simulation",
  management: "Simulation",
  strategy: "StrategyGame",
  "real time strategy (rts)": "StrategyGame",
  "turn-based strategy (tbs)": "StrategyGame",
  tactical: "StrategyGame",
  moba: "StrategyGame",
  sport: "SportsGame",
  "card & board game": "BoardGame",
};

/** Maps a game's IGDB genre names to deduplicated freedesktop category keys. */
function mapGenres(genres: string[]): string[] {
  return [
    ...new Set(
      genres
        .map((genre) => IGDB_GENRE_TO_CATEGORY[genre.toLowerCase()])
        .filter((category): category is string => category !== undefined),
    ),
  ];
}

export function normalize(entries: LutrisCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => {
    const categories = mapGenres(entry.genres);
    return {
      source: "lutris",
      name: entry.name,
      // The game's own real description beats the installer's one-liner
      // ("An installer for the GOG version of the game.") when present.
      description: entry.gameDescription ?? entry.description,
      version: "unknown",
      appId: entry.installerSlug,
      homepage: `https://lutris.net/games/${entry.gameSlug}/`,
      channel: entry.version,
      // A game's IGDB genres are positive evidence it's a game — the signal
      // the old "never set hasGameCategory" comment said didn't exist. A
      // non-game installer (Discord, Battle.net) carries no genres.
      hasGameCategory: entry.genres.length > 0 || undefined,
      categories: categories.length > 0 ? categories : undefined,
    };
  });
}
