import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { SnapcraftCacheEntry, SnapcraftFetchMetadata } from "./types";

const FIND_URL = "https://api.snapcraft.io/v2/snaps/find";
const FIELDS = "title,summary,version,channel,media,links";
const DEVICE_SERIES = "16";

// Snapcraft has no single full-catalog dump (unlike Flathub's appstream.xml.gz).
// The v1 API's /api/v1/snaps/sections lists the store's browse categories;
// sweeping all of them via v2's `category` filter is the closest thing to
// broad coverage available. Each category caps at 100 results with no
// pagination, so this is deliberately approximate — see docs/sources.md.
const CATEGORIES = [
  "art-and-design",
  "books-and-reference",
  "development",
  "devices-and-iot",
  "education",
  "entertainment",
  "featured",
  "finance",
  "games",
  "health-and-fitness",
  "music-and-audio",
  "news-and-weather",
  "personalisation",
  "photo-and-video",
  "productivity",
  "science",
  "security",
  "server-and-cloud",
  "social",
  "utilities",
];

interface RawMedia {
  type?: string;
  url?: string;
}

interface RawResult {
  name: string;
  revision?: { channel?: string; version?: string };
  snap?: {
    title?: string;
    summary?: string;
    media?: RawMedia[];
    links?: { website?: string[] };
  };
}

/**
 * Maps one category's raw `/v2/snaps/find` results to cache rows. Pure —
 * no I/O — so it's the part covered by tests.
 */
export function mapResults(results: RawResult[]): SnapcraftCacheEntry[] {
  return results
    .filter((result) => result.name)
    .map((result) => ({
      name: result.name,
      title: result.snap?.title ?? result.name,
      summary: result.snap?.summary ?? "",
      version: result.revision?.version ?? "unknown",
      channel: result.revision?.channel ?? "stable",
      iconUrl: result.snap?.media?.find((media) => media.type === "icon")?.url,
      website: result.snap?.links?.website?.[0],
    }));
}

async function findByCategory(category: string): Promise<RawResult[]> {
  const url = `${FIND_URL}?category=${category}&fields=${FIELDS}`;
  const response = await fetch(url, { headers: { "Snap-Device-Series": DEVICE_SERIES } });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Snapcraft category "${category}": ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as { results?: RawResult[] };
  return body.results ?? [];
}

/**
 * Sweeps every Snapcraft store category and writes the deduplicated,
 * normalized entries to `cachePath` as NDJSON. See docs/sources.md for why
 * this can't be exhaustive the way Flathub's fetch is.
 */
export async function fetchSnapcraft(cachePath: string): Promise<number> {
  const resultsByCategory = await Promise.all(
    CATEGORIES.map((category) => findByCategory(category)),
  );

  const byName = new Map<string, SnapcraftCacheEntry>();
  for (const entry of mapResults(resultsByCategory.flat())) {
    byName.set(entry.name, entry);
  }

  const entries = [...byName.values()];
  writeNdjson(cachePath, entries);
  writeMetadata<SnapcraftFetchMetadata>(cachePath, {
    source: "snapcraft",
    fetchedAt: new Date().toISOString(),
    url: FIND_URL,
    entryCount: entries.length,
    deviceSeries: DEVICE_SERIES,
    categoriesSwept: CATEGORIES,
  });

  return entries.length;
}
