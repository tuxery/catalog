import { fetchOrThrow } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { LutrisCacheEntry, LutrisFetchMetadata } from "./types";

// Lutris's installers API is real, public, and unauthenticated. Its
// /api/games endpoint looked more promising at first but is mostly an
// IGDB mirror with no reliable Linux signal. /api/installers is the
// useful one: community-authored install scripts, each tagged with a
// `runner` — "linux" (native) is what this connector wants; "wine"/
// "winesteam" (Windows via compatibility layer) and other runners
// (dosbox, scummvm, libretro, mame, ...) are left out. `?runner=linux`
// is silently ignored by the API, so filtering happens client-side
// after fetching instead. Pages come back at the server's own default
// size — no `page_size`/`limit` param needed.
const BASE_URL = "https://lutris.net/api/installers";

interface RawInstaller {
  game_id?: number;
  game_slug?: string;
  name?: string;
  runner?: string;
  published?: boolean;
  description?: string | null;
}

interface RawInstallersPage {
  results?: RawInstaller[];
  next?: string | null;
}

/**
 * Filters to published, native-Linux installers and deduplicates down
 * to one row per game — a game often has several installers (different
 * versions/methods), and the game-level fields (name, slug) are the
 * same across all of a game's installers, so it doesn't matter which
 * one is kept. Pure — no I/O.
 */
export function mapInstallers(installers: RawInstaller[]): LutrisCacheEntry[] {
  const byGameId = new Map<number, LutrisCacheEntry>();

  for (const installer of installers) {
    if (installer.runner !== "linux" || !installer.published) continue;
    if (!installer.game_id || !installer.game_slug || !installer.name) continue;
    if (byGameId.has(installer.game_id)) continue;

    byGameId.set(installer.game_id, {
      gameId: installer.game_id,
      gameSlug: installer.game_slug,
      name: installer.name,
      description: installer.description ?? "",
    });
  }

  return [...byGameId.values()];
}

async function fetchPage(url: string): Promise<RawInstallersPage> {
  const response = await fetchOrThrow(url, "Lutris installers");
  return (await response.json()) as RawInstallersPage;
}

/**
 * Downloads every published, native-Linux Lutris installer (paginated
 * sequentially, since the API has no documented rate limit) and writes
 * the deduplicated, normalized entries to `cachePath` as NDJSON. See
 * docs/sources.md.
 */
export async function fetchLutris(cachePath: string): Promise<number> {
  const installers: RawInstaller[] = [];
  let url: string | null = `${BASE_URL}?page=1`;
  let pagesFetched = 0;

  while (url) {
    // eslint-disable-next-line no-await-in-loop
    const page = await fetchPage(url);
    installers.push(...(page.results ?? []));
    url = page.next ?? null;
    pagesFetched++;
  }

  const entries = mapInstallers(installers);

  writeNdjson(cachePath, entries);
  writeMetadata<LutrisFetchMetadata>(cachePath, {
    source: "lutris",
    fetchedAt: new Date().toISOString(),
    url: BASE_URL,
    entryCount: entries.length,
    runnerFilter: "linux",
    pagesFetched,
  });

  return entries.length;
}
