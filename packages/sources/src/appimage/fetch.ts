import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { AppImageCacheEntry, AppImageFetchMetadata } from "./types";

const FEED_URL = "https://appimage.github.io/feed.json";

// GitHub's REST API: 60 req/hr unauthenticated, 5000/hr with a token —
// ~1,100 repos to resolve makes a token effectively required (would take
// 18+ hours unauthenticated). Version resolution is skipped entirely
// (not attempted per-repo, which would burn through the unauthenticated
// budget in a couple minutes for nothing) when GITHUB_TOKEN isn't set,
// same "degrade gracefully rather than fail" shape as catalog.ts's
// missing-TURSO_DB_URL handling in `app`.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
// Concurrent, not sequential (1,100 sequential requests would take
// several minutes) but capped rather than firing all at once — GitHub's
// abuse-detection mechanism throttles/blocks bursts of concurrent
// requests independent of the hourly rate limit.
const VERSION_FETCH_CONCURRENCY = 20;

interface RawLink {
  type?: string;
  url?: string;
}

interface RawItem {
  name?: string;
  description?: string;
  links?: RawLink[] | null;
  icons?: string[] | null;
}

interface RawFeed {
  items?: RawItem[];
}

/**
 * Maps raw feed items to cache rows, keeping only entries with a resolvable
 * GitHub repo — the closest thing this feed has to a stable identifier,
 * present on about 3 in 4 of AppImageHub's ~1,400 entries; the rest are
 * dropped. Pure — no I/O — so it's the part covered by tests.
 */
export function mapItems(items: RawItem[]): AppImageCacheEntry[] {
  const entries: AppImageCacheEntry[] = [];

  for (const item of items) {
    const repo = (item.links ?? [])?.find((link) => link.type === "GitHub")?.url;
    if (!item.name || !repo) continue;

    entries.push({
      name: item.name,
      description: item.description ?? "",
      repo,
      iconFilename: item.icons?.[0]?.split("/").pop(),
      homepage: `https://github.com/${repo}`,
    });
  }

  return entries;
}

/**
 * Looks up one repo's current version via its latest GitHub Release.
 * `undefined` covers every reason that can fail — no releases published,
 * archived/renamed/deleted repo, rate limited — none of which should stop
 * the rest of the fetch. Not exported/tested directly (network I/O); see
 * `resolveVersions` for the part that's actually exercised without hitting
 * the real API.
 */
async function fetchLatestVersion(repo: string): Promise<string | undefined> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers,
  });
  if (!response.ok) return undefined;

  const body = (await response.json()) as { tag_name?: string };
  return body.tag_name;
}

/**
 * Resolves every entry's version, `VERSION_FETCH_CONCURRENCY` at a time —
 * a plain `Promise.all` over 1,100 entries would fire every request at
 * once. Pure orchestration around the one network call in
 * `fetchLatestVersion`, injected so this shape is testable without it.
 */
export async function resolveVersions(
  entries: AppImageCacheEntry[],
  fetchVersion: (repo: string) => Promise<string | undefined>,
  concurrency: number,
): Promise<AppImageCacheEntry[]> {
  const results = [...entries];
  let next = 0;

  async function worker() {
    while (next < results.length) {
      const index = next++;
      const entry = results[index];
      if (!entry) continue;
      // Sequential *within* one worker is the point of this pattern — the
      // parallelism comes from running `concurrency` workers at once (see
      // the Promise.all below), not from awaiting everything simultaneously.
      // eslint-disable-next-line no-await-in-loop
      results[index] = { ...entry, version: await fetchVersion(entry.repo) };
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, results.length) }, worker));
  return results;
}

/**
 * Downloads AppImageHub's community-curated feed, resolves each entry's
 * real version via its GitHub Releases (when `GITHUB_TOKEN` is set — see
 * the module-level comment), and writes the normalized, GitHub-linked
 * entries to `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchAppImage(cachePath: string): Promise<number> {
  const response = await fetch(FEED_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch AppImageHub feed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as RawFeed;
  const items = body.items ?? [];
  const mapped = mapItems(items);
  const entries = GITHUB_TOKEN
    ? await resolveVersions(mapped, fetchLatestVersion, VERSION_FETCH_CONCURRENCY)
    : mapped;

  writeNdjson(cachePath, entries);
  writeMetadata<AppImageFetchMetadata>(cachePath, {
    source: "appimage",
    fetchedAt: new Date().toISOString(),
    url: FEED_URL,
    entryCount: entries.length,
    totalFeedItems: items.length,
    versionsResolved: GITHUB_TOKEN ? entries.filter((entry) => entry.version).length : 0,
  });

  return entries.length;
}
