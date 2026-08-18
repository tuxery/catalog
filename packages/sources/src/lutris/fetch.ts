import { fetchOrThrow } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { LutrisCacheEntry, LutrisFetchMetadata } from "./types";

// Lutris's installers API (lutris.net/api/installers) is real, public,
// and unauthenticated. Its own /api/games endpoint (347k+ entries) looked
// more promising at first glance but turned out to be mostly an IGDB
// mirror — most entries Windows-only or platform-unlabeled, not a real
// Linux signal on its own. /api/installers is the genuinely useful one:
// 15,557 community-authored install scripts, each tagged with a `runner`
// — "linux" (native, 2,261 of them, verified live) is what this connector
// wants; "wine"/"winesteam" (Windows games via a compatibility layer),
// "steam"/"web"/emulator runners (dosbox, scummvm, libretro, mame, ...)
// are all real but a different paradigm from every other source here,
// left out. A `?runner=linux` query param was tried first and verified
// live to be silently ignored (returns the same total count either way)
// — filtering happens client-side after fetching instead. Pages come
// back at the server's own default size (250 each, verified live) —
// no `page_size`/`limit` param was found to need setting explicitly.
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
 * to one row per game — real data has several installers for the same
 * game surprisingly often (332 of 1,795 real Linux-installer games have
 * 2+), different versions/methods for the same underlying game, not
 * different games. The game-level fields (name, slug) are identical
 * across a game's own installers regardless of which one is kept; only
 * the install script itself (not captured here) would differ. Pure —
 * no I/O.
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
 * sequentially — 63 real pages at the current catalog size, same "no
 * documented rate limit, don't assume one isn't needed" conservatism as
 * GOG's fetch) and writes the deduplicated, normalized entries to
 * `cachePath` as NDJSON. See docs/sources.md.
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
