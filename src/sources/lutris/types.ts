import type { FetchMetadata } from "../_shared/metadata";

/**
 * One published, native-Linux (`runner: "linux"`) installer from Lutris's
 * installers API, the shape cached after parsing. Deliberately close to
 * the upstream fields rather than the normalized `SourcedPackage` — see
 * `normalize.ts`. One row per installer, not per game — a game often has
 * several (different storefronts/methods), each kept rather than
 * collapsed, since each installs differently and needs its own account
 * (a "GOG" installer needs a GOG account, "Steam" needs Steam, ...).
 */
export interface LutrisCacheEntry {
  gameId: number;
  gameSlug: string;
  /** This installer's own unique slug (e.g. `frozen-synapse-gog`) — unlike `gameSlug`, which every installer of the same game shares, this one's distinct per installer. Lutris's closest thing to a per-package id. */
  installerSlug: string;
  name: string;
  /** This installer's own description, e.g. "Play \"X\" on Linux!" — installer-specific text, the closest thing to a game description this API exposes. */
  description: string;
  /**
   * The game's own IGDB-sourced genres (from `/api/games/<game_slug>`),
   * e.g. `["FPS"]` / `["Roguelike", "RPG"]` — the only per-game genre
   * signal Lutris exposes. `[]` for games with no genre at all. See
   * `normalize.ts`'s `IGDB_GENRE_TO_CATEGORY` for how this maps to the
   * game taxonomy.
   */
  genres: string[];
  /** The game's own real description from `/api/games/<game_slug>`, richer than the installer's one-liner. `undefined` when Lutris has none. */
  gameDescription?: string;
  /** The installer's own storefront/method label as Lutris names it (e.g. "GOG", "Steam", "CD + nGlide") — not a software version, Lutris's closest thing to a build-channel tag (see `normalize.ts`). `undefined` when Lutris leaves it blank. */
  version?: string;
}

export interface LutrisFetchMetadata extends FetchMetadata {
  /** Server-side query filters used — see fetch.ts for why `runner` isn't actually one of them (the API ignores it). */
  runnerFilter: string;
  pagesFetched: number;
}
