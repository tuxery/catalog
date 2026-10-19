import { unique } from "helpers4/array";
import { percentileScores } from "../_shared/popularity";
import type { SourcedPackage } from "../types";
import type { GogCacheEntry } from "./types";

// GOG's own genre-tag vocabulary (catalog.gog.com/v1/catalog's `genres`
// field — real, verified live 2026-09-03: e.g. the Witcher 2 carries
// [{name:"Role-playing",slug:"rpg"},{name:"Action",slug:"action"},
// {name:"Fantasy",slug:"fantasy"}]) mapped to the closest
// `categories-games.json` freedesktop-equivalent key, reusing the exact
// same `pickCategory`/`GAME_CATEGORY_PREFERENCE` mechanism every other
// source's genre signal already goes through rather than inventing a
// parallel one. Deliberately NOT every GOG slug: "fantasy"/"scifi"/
// "narrative"/"mystery"/"horror"/"historical"/"comedy"/"exploration"/
// "detective"/"modern"/"combat"/"fpp"/"tpp"/"programming"/"indie"/"casual"
// are themes/settings/perspectives, not genres, and "racing"/"survival"/
// "sandbox"/"turnbased"/"realtime" were checked and rejected — racing in
// particular is a real, legitimate genre with no home in the 10-value
// taxonomy (see category.ts's own comment on Casino/Casual/Music/Racing/
// Trivia/Word), not something to force-map to Sports.
const GOG_GENRE_SLUG_TO_GENRE_CATEGORY: Record<string, string> = {
  rpg: "RolePlaying",
  jrpg: "RolePlaying",
  rougelike: "RolePlaying", // GOG's own spelling of "roguelike" — same genre-family reasoning as Gentoo/AUR's games-roguelike.
  strategy: "StrategyGame",
  tactical: "StrategyGame",
  managerial: "Simulation",
  building: "Simulation",
  economic: "Simulation",
  virtuallife: "Simulation",
  simulation: "Simulation",
  puzzle: "LogicGame",
  "hidden-object": "LogicGame",
  adventure: "AdventureGame",
  pointandclick: "AdventureGame",
  "visual-novel": "AdventureGame",
  platformer: "ArcadeGame",
  arcade: "ArcadeGame",
  metroidvania: "ActionGame",
  action: "ActionGame",
  shooter: "Shooter",
  fighting: "ActionGame",
};

/** Every GOG genre slug mapped through `GOG_GENRE_SLUG_TO_GENRE_CATEGORY`, deduplicated — feeds straight into `SourcedPackage.categories`, the same field every other source's genre/category signal populates. */
function mapGogGenres(slugs: string[]): string[] {
  const mapped = slugs
    .map((slug) => GOG_GENRE_SLUG_TO_GENRE_CATEGORY[slug])
    .filter((category): category is string => category !== undefined);
  return unique(mapped);
}

export function normalize(entries: GogCacheEntry[]): SourcedPackage[] {
  // GOG's catalog API has no popularity figure, but every product reports how
  // many reviews it has: its percentile among GOG's games is the popularity
  // signal (the way Debian's popcon and Arch's pkgstats become one), so the
  // GOG trending row has more than the 16 games borrowing a score from
  // another source. Products without a review get none, never a fake zero.
  const popularity = percentileScores(
    new Map(entries.map((entry) => [entry.id, entry.rating?.count ?? 0])),
  );
  return entries.map((entry) => {
    // Defensive against the pre-existing committed cache file, which
    // predates this field and has no `genres` key at all yet (until the
    // next `pnpm run refresh gog` regenerates it) — JSON.parse doesn't
    // enforce GogCacheEntry's type at runtime.
    const categories = mapGogGenres(entry.genres ?? []);
    return {
      source: "gog",
      name: entry.title,
      // The catalog-list endpoint has no description field — only the
      // per-product detail page does, which isn't worth an extra request
      // per entry just for this.
      description: "",
      // GOG sells downloadable installers/DRM-free builds, not versioned
      // packages — there's no real version concept to thread through.
      version: "unknown",
      appId: entry.slug,
      homepage: entry.storeLink ?? `https://www.gog.com/game/${entry.slug}`,
      // Every entry here already passed fetch.ts's productType === "game" filter.
      hasGameCategory: true,
      developer: entry.developers[0],
      publisher: entry.publisher,
      ageRating: entry.ageRating,
      iconUrl: entry.iconUrl,
      longDescription: entry.longDescription,
      screenshots: entry.screenshots.length > 0 ? entry.screenshots : undefined,
      rating: entry.rating,
      popularity: popularity.get(entry.id),
      categories: categories.length > 0 ? categories : undefined,
    };
  });
}
