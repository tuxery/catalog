import { dedupeByKey } from "../_shared/dedupe";
import { fetchOrThrow } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { StoreCollectionTag } from "../types";
import type { SnapcraftCacheEntry, SnapcraftFetchMetadata } from "./types";

// Snapcraft's own hand-picked "featured" collection — distinct from the
// `category=featured` store category already swept below (that's one
// bucket among many in the general merge, with no memory of which
// category an app came from); this hits the same endpoint the card
// verified live, tagging matches with `SourcedPackage.storeCollections` instead.
// ~100 snaps, no pagination param accepted (same ceiling as every other
// `find` call here).
const FEATURED_PARAMS = "featured=true";

const FIND_URL = "https://api.snapcraft.io/v2/snaps/find";
const FIELDS = "title,summary,version,channel,media,links";
const DEVICE_SERIES = "16";

// Snapcraft has no single full-catalog dump (unlike Flathub's appstream.xml.gz),
// and /v2/snaps/find has no pagination or sort parameter — `page` and
// `sort` are rejected outright as "Bad parameters" — so every query caps
// at ~100 results. This sweeps two independent dimensions and merges by
// name: the v1 API's store categories (closest thing to a
// browse-everything view), and a single-character `q=` search per
// letter/digit (results are title-substring matches, not just prefix, so
// this catches snaps a category sweep alone misses) — neither sweep
// subsumes the other.
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

// Snapcraft's own store-category vocabulary (development, art-and-design,
// ...) doesn't share freedesktop.org's category vocabulary the rest of the
// catalog's classifier expects (SourcedPackage.categories, enrich/
// category.ts's pickCategory) — most of it doesn't map cleanly onto ours
// at all. Checked live and rejected: devices-and-iot and health-and-fitness
// (no equivalent category exists), entertainment (mixes media players,
// downloaders, a terminal toy, and a real-time-strategy game — too vague
// to place), personalisation (mixes disk-cleaners and a graphical shell in
// with actual wallpapers/themes), server-and-cloud (Kubernetes/infra/
// sysadmin tooling, a different concept from our desktop-scoped "System
// Tools"), featured (not a real category, already its own storeCollections
// tag above). Only the mappings below were verified live to line up
// closely enough with an existing freedesktop key to reuse it outright —
// no new category or config file needed, pickCategory picks it up
// unchanged since it's keyed by the same freedesktop vocabulary Flathub/
// AppCenter already populate this field with.
const SNAP_CATEGORY_TO_FREEDESKTOP: Record<string, string> = {
  "art-and-design": "Graphics",
  "books-and-reference": "Documentation",
  development: "Development",
  education: "Education",
  finance: "Finance",
  "music-and-audio": "Audio",
  "news-and-weather": "News",
  "photo-and-video": "Photography",
  productivity: "Office",
  science: "Science",
  security: "Security",
  social: "Chat",
  utilities: "Utility",
};

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

/** Tags each entry `["featured"]` when its name is in the featured-collection sweep's result set, `undefined` otherwise. Pure — no I/O. */
export function applyFeaturedTag(
  entries: SnapcraftCacheEntry[],
  featuredNames: Set<string>,
): SnapcraftCacheEntry[] {
  return entries.map((entry) =>
    Object.assign(entry, {
      storeCollections: featuredNames.has(entry.name)
        ? (["featured"] satisfies StoreCollectionTag[])
        : undefined,
    }),
  );
}

/**
 * Translates each swept Snap store category into the freedesktop-equivalent
 * tag `pickCategory` already understands (see `SNAP_CATEGORY_TO_FREEDESKTOP`
 * above), and separately flags the dedicated "games" category as
 * `hasGameCategory` — Snap's own vocabulary has no game-genre granularity
 * to translate onto `GAME_CATEGORY_LABELS`. A snap can legitimately appear
 * under more than one category sweep, so `categories` can carry more than
 * one tag. Pure — no I/O — so it's the part covered by tests.
 */
export function applyCategories(
  entries: SnapcraftCacheEntry[],
  namesByCategory: Map<string, string[]>,
): SnapcraftCacheEntry[] {
  const freedesktopByName = new Map<string, Set<string>>();
  const gameNames = new Set<string>();

  for (const [category, names] of namesByCategory) {
    if (category === "games") {
      for (const name of names) gameNames.add(name);
      continue;
    }
    const freedesktop = SNAP_CATEGORY_TO_FREEDESKTOP[category];
    if (!freedesktop) continue;
    for (const name of names) {
      const tags = freedesktopByName.get(name) ?? new Set<string>();
      tags.add(freedesktop);
      freedesktopByName.set(name, tags);
    }
  }

  return entries.map((entry) => {
    const tags = freedesktopByName.get(entry.name);
    return Object.assign(entry, {
      categories: tags ? [...tags] : undefined,
      hasGameCategory: gameNames.has(entry.name) || undefined,
    });
  });
}

async function find(params: string, label: string): Promise<RawResult[]> {
  const url = `${FIND_URL}?${params}&fields=${FIELDS}`;
  const response = await fetchOrThrow(url, `Snapcraft "${label}"`, {
    headers: { "Snap-Device-Series": DEVICE_SERIES },
  });

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
  const [categoryResults, queryResults, featuredResults] = await Promise.all([
    Promise.all(CATEGORIES.map((category) => find(`category=${category}`, category))),
    Promise.all(QUERY_CHARS.map((char) => find(`q=${char}`, `q=${char}`))),
    find(FEATURED_PARAMS, "featured"),
  ]);

  const featuredNames = new Set(featuredResults.map((result) => result.name).filter(Boolean));
  const namesByCategory = new Map(
    CATEGORIES.map((category, i) => [
      category,
      (categoryResults[i] ?? []).map((result) => result.name).filter(Boolean),
    ]),
  );
  const deduped = dedupeByKey(
    mapResults([...categoryResults.flat(), ...queryResults.flat()]),
    (entry) => entry.name,
  );
  const entries = applyCategories(applyFeaturedTag(deduped, featuredNames), namesByCategory);

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
