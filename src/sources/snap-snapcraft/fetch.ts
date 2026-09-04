import { parallel } from "@helpers4/promise";
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

// "featured" is a curated collection, not a real browse category — it's
// swept separately via `FEATURED_PARAMS` for the storeCollections tag, and
// excluded here so the per-category recursive sweep only enumerates the 20
// real categories.
const REAL_CATEGORIES = CATEGORIES.filter((category) => category !== "featured");

const QUERY_CHARS = [..."abcdefghijklmnopqrstuvwxyz0123456789"];

// `/v2/snaps/find` caps every response at exactly 100 results (verified
// live 2026-09-04: `q=a` and even `q=ab` both return exactly 100 — the
// single-character sweep above was silently truncating any letter/digit
// popular enough to have >100 matching snaps). Below this, most queries
// return well under the cap (`q=abc` -> 15, `q=xyz` -> 3, `q=zzz` -> 5),
// so a prefix that comes back AT the cap gets recursively re-swept with
// one more character appended, and one that comes back under it is
// trusted as complete — no known way to tell a query is exactly 100
// results by coincidence rather than truncated, but Snapcraft's own
// store is nowhere near large enough for that to matter in practice.
const FIND_CAP = 100;

// Bounds worst-case request volume against a public third-party API
// (`36^4` prefixes if every single one kept hitting the cap, which
// doesn't happen in practice — real runs top out at a few thousand
// requests total since the vast majority of 2-3 character prefixes drop
// well under 100 matches) — a circuit breaker, not an expected ceiling.
const MAX_QUERY_DEPTH = 4;
const SWEEP_CONCURRENCY = 8;
// The per-category recursive sweeps run several `sweepQueriesRecursively`
// instances at once (each itself up to `SWEEP_CONCURRENCY` requests) — this
// bounds how many categories sweep in parallel so the *total* in-flight
// request count stays comparable to the old flat category sweep's load
// (which was one request per category), rather than `20 * 8` at once.
const CATEGORY_SWEEP_CONCURRENCY = 3;
// The recursive sweeps push ~4k requests at Snapcraft's public API in one
// run; the API intermittently resets a socket under that load
// (`UND_ERR_SOCKET`). Retry a few times with exponential backoff rather
// than failing the whole multi-minute fetch on one transient drop.
const FIND_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 500;

/**
 * Recursively sweeps `q=` searches, breadth-first by prefix length:
 * every prefix that comes back at the 100-result cap gets re-swept once
 * per extra character (`"a"` capped -> try `"aa"`, `"ab"`, ..., `"a9"`),
 * down to `MAX_QUERY_DEPTH` characters. Bounded concurrency
 * (`SWEEP_CONCURRENCY`) rather than firing every prefix at once, out of
 * courtesy to a public API with no documented rate limit. Pure aside
 * from the injected `findQuery` call, so the traversal logic itself is
 * testable without a real network dependency.
 */
export async function sweepQueriesRecursively(
  findQuery: (prefix: string) => Promise<RawResult[]>,
): Promise<{ results: RawResult[]; prefixesTried: number }> {
  const seen = new Map<string, RawResult>();
  let frontier = QUERY_CHARS;
  let prefixesTried = 0;

  for (let depth = 1; frontier.length > 0 && depth <= MAX_QUERY_DEPTH; depth++) {
    prefixesTried += frontier.length;
    // eslint-disable-next-line no-await-in-loop
    const batches = await parallel(
      frontier.map((prefix) => async () => ({ prefix, results: await findQuery(prefix) })),
      SWEEP_CONCURRENCY,
    );

    const nextFrontier: string[] = [];
    for (const { prefix, results } of batches) {
      for (const result of results) {
        if (result.name) seen.set(result.name, result);
      }
      if (results.length >= FIND_CAP) {
        for (const char of QUERY_CHARS) nextFrontier.push(prefix + char);
      }
    }
    frontier = nextFrontier;
  }

  return { results: [...seen.values()], prefixesTried };
}

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

async function find(params: string, label: string, attempt = 0): Promise<RawResult[]> {
  const url = `${FIND_URL}?${params}&fields=${FIELDS}`;
  try {
    const response = await fetchOrThrow(url, `Snapcraft "${label}"`, {
      headers: { "Snap-Device-Series": DEVICE_SERIES },
    });
    const body = (await response.json()) as { results?: RawResult[] };
    return body.results ?? [];
  } catch (error) {
    if (attempt + 1 >= FIND_RETRIES) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** attempt));
    return find(params, label, attempt + 1);
  }
}

/**
 * Sweeps every Snapcraft store category and a recursively-deepened `q=`
 * search (see `sweepQueriesRecursively`), merges both by name, and writes
 * the deduplicated, normalized entries to `cachePath` as NDJSON. See
 * docs/sources.md for why this still can't be a true full-catalog dump
 * the way Flathub's fetch is (no known way to actually enumerate the
 * store) — but the recursive sweep gets meaningfully closer than a flat
 * single-character one, which silently truncated at 100 results for
 * every popular letter/digit.
 */
export async function fetchSnapcraft(cachePath: string): Promise<number> {
  // The category sweep is now recursive (`category=X&q=prefix`) rather than
  // a flat top-100 per category — a flat `find?category=X` silently truncates
  // at 100 results for any category with more than that (games, development,
  // productivity, ...), which was the whole reason most snaps came back
  // without a category. Scoping `sweepQueriesRecursively`'s `q=` deepening
  // to each category gets the FULL membership of every category, so
  // `applyCategories` can tag every snap with its real store category.
  const [categorySweeps, queryResults, featuredResults] = await Promise.all([
    parallel(
      REAL_CATEGORIES.map(
        (category) => () =>
          sweepQueriesRecursively((prefix) =>
            find(
              `category=${category}&q=${encodeURIComponent(prefix)}`,
              `category=${category} q=${prefix}`,
            ),
          ),
      ),
      CATEGORY_SWEEP_CONCURRENCY,
    ),
    sweepQueriesRecursively((prefix) => find(`q=${encodeURIComponent(prefix)}`, `q=${prefix}`)),
    find(FEATURED_PARAMS, "featured"),
  ]);

  const featuredNames = new Set(featuredResults.map((result) => result.name).filter(Boolean));
  const namesByCategory = new Map(
    REAL_CATEGORIES.map((category, i) => [
      category,
      (categorySweeps[i]?.results ?? []).map((result) => result.name).filter(Boolean),
    ]),
  );
  const deduped = dedupeByKey(
    mapResults([...categorySweeps.flatMap((sweep) => sweep.results), ...queryResults.results]),
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
    categoriesSwept: REAL_CATEGORIES,
    queryCharsSwept: QUERY_CHARS,
    queryPrefixesTried: queryResults.prefixesTried,
    categoryPrefixesTried: categorySweeps.reduce((sum, sweep) => sum + sweep.prefixesTried, 0),
  });

  return entries.length;
}
