import type { FetchMetadata } from "../_shared/metadata";

/**
 * One game with a published, native-Linux (`runner: "linux"`) install
 * script from Lutris's installers API, the shape cached after parsing.
 * Deliberately close to the upstream fields rather than the normalized
 * `SourcedPackage` — see `normalize.ts`. Not the installer itself (there
 * can be several per game, deduplicated to one row in `fetch.ts`), just
 * the game-level fields every one of a game's installers shares.
 */
export interface LutrisCacheEntry {
  gameId: number;
  gameSlug: string;
  name: string;
  /** The chosen installer's own description, e.g. "Play \"X\" on Linux!" — installer-specific text, the closest thing to a game description this API exposes. */
  description: string;
}

export interface LutrisFetchMetadata extends FetchMetadata {
  /** Server-side query filters used — see fetch.ts for why `runner` isn't actually one of them (the API ignores it). */
  runnerFilter: string;
  pagesFetched: number;
}
