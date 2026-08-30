import { parseAppstreamXml, resolveIconUrl } from "../_shared/appstream";
import { fetchOrThrow, fetchGunzippedText } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import { fetchOdrsRatings, pickOdrsRating, type OdrsRating } from "../_shared/odrs";
import type { StoreCollectionTag } from "../types";
import type { FlathubCacheEntry, FlathubFetchMetadata } from "./types";

// Flathub publishes one appstream file per arch — this is the one most
// desktop Linux installs actually run on. aarch64 is available at the same
// path with the arch swapped, if/when Tuxery needs it.
const ARCH = "x86_64";
const REPO_BASE = `https://dl.flathub.org/repo/appstream/${ARCH}`;
const APPSTREAM_URL = `${REPO_BASE}/appstream.xml.gz`;

// Flathub's own collection API — the same ranked/curated lists its own
// frontend uses — public and unauthenticated. "Popular" is a top-250
// ranking (see `rankPopularity`); "verified"/"recently-added"/
// "recently-updated" are membership collections instead (see
// `SourcedPackage.storeCollections`'s doc comment for the scope each gets).
const COLLECTION_BASE_URL = "https://flathub.org/api/v2/collection";

interface RawCollectionHit {
  app_id?: string;
}

interface RawCollectionResponse {
  hits?: RawCollectionHit[];
  totalPages?: number;
}

const COLLECTION_PAGE_SIZE = 250;

// `per_page` isn't just an optional tuning knob despite the OpenAPI spec
// listing both as independently nullable — verified live: `?page=1` alone
// 400s ("Bad Request"), and so does `?per_page=250` alone; only passing
// both together actually works.
async function fetchCollectionPage(
  collection: string,
  page: number,
): Promise<RawCollectionResponse> {
  const url = `${COLLECTION_BASE_URL}/${collection}?page=${page}&per_page=${COLLECTION_PAGE_SIZE}`;
  const response = await fetchOrThrow(url, `Flathub "${collection}" collection`);
  return (await response.json()) as RawCollectionResponse;
}

/**
 * Ranks Flathub's own "Popular" collection into a 0-1 score by list
 * position (1 for rank 1, decreasing towards 0 for rank 250) — see
 * `SourcedPackage.popularity`. Apps outside the top 250 get no score at
 * all, never a fake bottom value — this list is a ranking, not a full
 * catalog census. Pure — no I/O.
 */
export function rankPopularity(hits: RawCollectionHit[]): Map<string, number> {
  const scores = new Map<string, number>();
  hits.forEach((hit, index) => {
    if (!hit.app_id) return;
    scores.set(hit.app_id, hits.length > 1 ? 1 - index / (hits.length - 1) : 1);
  });
  return scores;
}

async function fetchPopularityRanks(): Promise<Map<string, number>> {
  const data = await fetchCollectionPage("popular", 1);
  return rankPopularity(data.hits ?? []);
}

/**
 * Every real `app_id` in one page of hits — the collection-membership fetches
 * only need membership, not rank position (unlike `rankPopularity`).
 * Pure — no I/O.
 */
function extractIds(hits: RawCollectionHit[]): string[] {
  return hits.flatMap((hit) => (hit.app_id ? [hit.app_id] : []));
}

/**
 * Fetches every page of a Flathub collection, not just the first — used
 * for "verified" specifically, since it's a real status (a developer
 * either is or isn't verified), not a ranking, so truncating to page 1
 * would misreport most actually-verified apps as unverified. Verified
 * live (2026-08-30): 2,165 apps across 9 pages.
 */
async function fetchAllCollectionIds(collection: string): Promise<string[]> {
  const first = await fetchCollectionPage(collection, 1);
  const ids = extractIds(first.hits ?? []);
  const totalPages = first.totalPages ?? 1;

  for (let page = 2; page <= totalPages; page++) {
    // eslint-disable-next-line no-await-in-loop
    const next = await fetchCollectionPage(collection, page);
    ids.push(...extractIds(next.hits ?? []));
  }

  return ids;
}

/** Only the first page (top 250) — "recently-added"/"recently-updated" are recency-ordered feeds, same "not a full census" scope `popular` already has, not a status like "verified". */
async function fetchTopCollectionIds(collection: string): Promise<string[]> {
  const data = await fetchCollectionPage(collection, 1);
  return extractIds(data.hits ?? []);
}

/**
 * Combines every collection's id list into one `app_id ->
 * tags` map — an app can be in more than one (e.g. verified AND
 * recently-updated). Pure — no I/O.
 */
export function buildStoreCollectionTags(
  collections: { tag: StoreCollectionTag; ids: string[] }[],
): Map<string, StoreCollectionTag[]> {
  const byId = new Map<string, StoreCollectionTag[]>();
  for (const { tag, ids } of collections) {
    for (const id of ids) {
      const tags = byId.get(id) ?? [];
      tags.push(tag);
      byId.set(id, tags);
    }
  }
  return byId;
}

async function fetchStoreCollectionTags(): Promise<Map<string, StoreCollectionTag[]>> {
  const [verified, recentlyAdded, recentlyUpdated] = await Promise.all([
    fetchAllCollectionIds("verified"),
    fetchTopCollectionIds("recently-added"),
    fetchTopCollectionIds("recently-updated"),
  ]);

  return buildStoreCollectionTags([
    { tag: "verified", ids: verified },
    { tag: "recently-added", ids: recentlyAdded },
    { tag: "recently-updated", ids: recentlyUpdated },
  ]);
}

/**
 * Parses Flathub's appstream XML (already decompressed) into cache rows.
 * Mostly a thin wrapper — parsing itself is shared with elementary
 * AppCenter (another Flatpak remote publishing the identical format) in
 * `_shared/appstream.ts` — but resolves each entry's icon URL against
 * Flathub's own repo base, and joins in its ODRS rating (see
 * `_shared/odrs.ts`) by `.desktop`-suffixed id and popularity rank by bare
 * id. Pure — no I/O.
 */
export function parseAppstream(
  xml: string,
  odrsRatings: Map<string, OdrsRating>,
  popularityRanks: Map<string, number>,
  storeCollectionTags: Map<string, StoreCollectionTag[]> = new Map(),
): FlathubCacheEntry[] {
  return parseAppstreamXml(xml).map((entry) =>
    Object.assign(entry, {
      iconUrl: resolveIconUrl(entry, REPO_BASE),
      rating: pickOdrsRating(odrsRatings, entry.id),
      popularity: popularityRanks.get(entry.id),
      storeCollections: storeCollectionTags.get(entry.id),
    }),
  );
}

/**
 * Downloads Flathub's appstream repodata — the same file real Flatpak
 * clients use to discover apps — and writes the normalized entries to
 * `cachePath` as NDJSON. Single gzipped XML file, no auth, no pagination;
 * see docs/sources.md.
 */
export async function fetchFlathub(cachePath: string): Promise<number> {
  const [xml, odrsRatings, popularityRanks, storeCollectionTags] = await Promise.all([
    fetchGunzippedText(APPSTREAM_URL, "Flathub appstream"),
    fetchOdrsRatings(),
    fetchPopularityRanks(),
    fetchStoreCollectionTags(),
  ]);
  const entries = parseAppstream(xml, odrsRatings, popularityRanks, storeCollectionTags);

  writeNdjson(cachePath, entries);
  writeMetadata<FlathubFetchMetadata>(cachePath, {
    source: "flatpak-flathub",
    fetchedAt: new Date().toISOString(),
    url: APPSTREAM_URL,
    entryCount: entries.length,
    arch: ARCH,
  });

  return entries.length;
}
