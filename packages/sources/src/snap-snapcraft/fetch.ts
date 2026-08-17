import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { SnapcraftCacheEntry, SnapcraftFetchMetadata } from "./types";

const FIND_URL = "https://api.snapcraft.io/v2/snaps/find";
const FIELDS = "title,summary,version,channel,media,links";
const DEVICE_SERIES = "16";

// Snapcraft has no single full-catalog dump (unlike Flathub's appstream.xml.gz),
// and /v2/snaps/find has no pagination or sort parameter (both verified —
// `page` and `sort` are rejected outright as "Bad parameters") — every
// query, category or keyword alike, caps at ~100 results. So this sweeps
// two independent dimensions and merges by name: the v1 API's store
// categories (closest thing to a browse-everything view), and a
// single-character `q=` search per letter/digit (since results seem to be
// title-substring matches, not just prefix, this catches snaps a category
// sweep alone misses). Verified against the real API: categories alone
// found 1,542 unique snaps, the letter/digit sweep alone found 2,919
// (809 overlapping with categories), the union is 3,652 — worth doing
// both, neither sweep subsumes the other.
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

const QUERY_CHARS = [..."abcdefghijklmnopqrstuvwxyz0123456789"];

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
 * Maps one sweep's raw `/v2/snaps/find` results to cache rows. Pure — no
 * I/O — so it's the part covered by tests.
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

async function find(params: string, label: string): Promise<RawResult[]> {
  const url = `${FIND_URL}?${params}&fields=${FIELDS}`;
  const response = await fetch(url, { headers: { "Snap-Device-Series": DEVICE_SERIES } });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Snapcraft "${label}": ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as { results?: RawResult[] };
  return body.results ?? [];
}

/**
 * Sweeps every Snapcraft store category and every single-character search
 * query, merges both by name, and writes the deduplicated, normalized
 * entries to `cachePath` as NDJSON. See docs/sources.md for why this still
 * can't be exhaustive the way Flathub's fetch is (no known way to actually
 * enumerate the full store).
 */
export async function fetchSnapcraft(cachePath: string): Promise<number> {
  const [categoryResults, queryResults] = await Promise.all([
    Promise.all(CATEGORIES.map((category) => find(`category=${category}`, category))),
    Promise.all(QUERY_CHARS.map((char) => find(`q=${char}`, `q=${char}`))),
  ]);

  const byName = new Map<string, SnapcraftCacheEntry>();
  for (const entry of mapResults([...categoryResults.flat(), ...queryResults.flat()])) {
    byName.set(entry.name, entry);
  }

  const entries = [...byName.values()];
  writeNdjson(cachePath, entries);
  writeMetadata<SnapcraftFetchMetadata>(cachePath, {
    source: "snap-snapcraft",
    fetchedAt: new Date().toISOString(),
    url: FIND_URL,
    entryCount: entries.length,
    deviceSeries: DEVICE_SERIES,
    categoriesSwept: CATEGORIES,
    queryCharsSwept: QUERY_CHARS,
  });

  return entries.length;
}
