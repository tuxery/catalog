import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { AppImageCacheEntry, AppImageFetchMetadata } from "./types";

const FEED_URL = "https://appimage.github.io/feed.json";

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
 * Downloads AppImageHub's community-curated feed and writes the
 * normalized, GitHub-linked entries to `cachePath` as NDJSON. Doesn't
 * resolve real versions via each repo's GitHub Releases yet — see
 * docs/sources.md.
 */
export async function fetchAppImage(cachePath: string): Promise<number> {
  const response = await fetch(FEED_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch AppImageHub feed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as RawFeed;
  const items = body.items ?? [];
  const entries = mapItems(items);

  writeNdjson(cachePath, entries);
  writeMetadata<AppImageFetchMetadata>(cachePath, {
    source: "appimage",
    fetchedAt: new Date().toISOString(),
    url: FEED_URL,
    entryCount: entries.length,
    totalFeedItems: items.length,
  });

  return entries.length;
}
