import { fetchOrThrow } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { AppImageCacheEntry, AppImageFetchMetadata } from "./types";

const FEED_URL = "https://appimage.github.io/feed.json";

// GitHub's REST API: 60 req/hr unauthenticated, 5000/hr with a token —
// ~1,100 repos x 2 calls each (existence + latest release) makes a token
// effectively required (would take 37+ hours unauthenticated). Version
// resolution is skipped entirely (not attempted per-repo, which would
// burn through the unauthenticated budget in a couple minutes for
// nothing) when GITHUB_TOKEN isn't set, same "degrade gracefully rather
// than fail" shape as catalog.ts's missing-TURSO_DB_URL handling in `app`.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
// Concurrent, not sequential (1,100 sequential lookups would take
// several minutes) but capped rather than firing all at once — GitHub's
// abuse-detection mechanism throttles/blocks bursts of concurrent
// requests independent of the hourly rate limit.
const LOOKUP_CONCURRENCY = 20;

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
 * present on about 3 in 4 of the feed's ~1,400 entries; the rest are
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

export interface RepoLookupResult {
  /**
   * `false` only for a confirmed 404 on the repo itself — deleted,
   * renamed, or made private, i.e. the feed pointing at something that
   * no longer exists (the "veracity" half of the
   * "AppImage exhaustiveness and veracity" card). A repo that exists but
   * has no releases (continuous-build-only projects, or ones that just
   * haven't tagged one) is `exists: true` with `version: undefined` —
   * that's a legitimate state, not a reason to drop the entry.
   */
  exists: boolean;
  version?: string;
}

/**
 * Looks up one repo's existence and, if it exists, its current version
 * via the latest GitHub Release. A network/rate-limit error on either
 * call degrades to `exists: true` (ambiguous failures shouldn't drop a
 * real entry) rather than `exists: false`, which is reserved for a
 * confirmed 404. Not exported/tested directly (network I/O); see
 * `resolveEntries` for the part that's actually exercised without
 * hitting the real API.
 */
async function lookupRepo(repo: string): Promise<RepoLookupResult> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

  const repoResponse = await fetch(`https://api.github.com/repos/${repo}`, { headers });
  if (repoResponse.status === 404) return { exists: false };
  if (!repoResponse.ok) return { exists: true };

  const releaseResponse = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers,
  });
  if (!releaseResponse.ok) return { exists: true };

  const body = (await releaseResponse.json()) as { tag_name?: string };
  return { exists: true, version: body.tag_name };
}

/**
 * Resolves every entry's repo existence + version, `concurrency` at a
 * time — a plain `Promise.all` over 1,100 entries would fire every
 * request at once — dropping entries whose repo no longer exists. Pure
 * orchestration around the one network call in `lookupRepo`, injected so
 * this shape is testable without it.
 */
export async function resolveEntries(
  entries: AppImageCacheEntry[],
  lookup: (repo: string) => Promise<RepoLookupResult>,
  concurrency: number,
): Promise<AppImageCacheEntry[]> {
  const results: (AppImageCacheEntry | undefined)[] = [...entries];
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
      const result = await lookup(entry.repo);
      results[index] = result.exists ? { ...entry, version: result.version } : undefined;
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, results.length) }, worker));
  return results.filter((entry) => entry !== undefined);
}

/**
 * Downloads the community-curated feed, resolves each entry's repo
 * existence + real version via GitHub (when `GITHUB_TOKEN` is set — see
 * the module-level comment), dropping entries whose repo is confirmed
 * gone, and writes the normalized, GitHub-linked entries to `cachePath`
 * as NDJSON. See docs/sources.md.
 */
export async function fetchAppImage(cachePath: string): Promise<number> {
  const response = await fetchOrThrow(FEED_URL, "appimage.github.io feed");
  const body = (await response.json()) as RawFeed;
  const items = body.items ?? [];
  const mapped = mapItems(items);
  const entries = GITHUB_TOKEN
    ? await resolveEntries(mapped, lookupRepo, LOOKUP_CONCURRENCY)
    : mapped;

  writeNdjson(cachePath, entries);
  writeMetadata<AppImageFetchMetadata>(cachePath, {
    source: "appimage",
    fetchedAt: new Date().toISOString(),
    url: FEED_URL,
    entryCount: entries.length,
    totalFeedItems: items.length,
    versionsResolved: GITHUB_TOKEN ? entries.filter((entry) => entry.version).length : 0,
    deadReposDropped: GITHUB_TOKEN ? mapped.length - entries.length : 0,
  });

  return entries.length;
}
