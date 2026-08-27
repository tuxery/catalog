import { parseAppstreamXml, resolveIconUrl } from "../_shared/appstream";
import { fetchOrThrow, fetchGunzippedText } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import { fetchOdrsRatings, pickOdrsRating, type OdrsRating } from "../_shared/odrs";
import type { FlathubCacheEntry, FlathubFetchMetadata } from "./types";

// Flathub publishes one appstream file per arch — this is the one most
// desktop Linux installs actually run on. aarch64 is available at the same
// path with the arch swapped, if/when Tuxery needs it.
const ARCH = "x86_64";
const REPO_BASE = `https://dl.flathub.org/repo/appstream/${ARCH}`;
const APPSTREAM_URL = `${REPO_BASE}/appstream.xml.gz`;

// Flathub's own "Popular" collection — the same ranked list its own
// frontend uses — public and unauthenticated: one call returns its
// current top 250 apps in rank order, no per-app request needed.
const POPULAR_URL = "https://flathub.org/api/v2/collection/popular";

interface RawPopularHit {
  app_id?: string;
}

interface RawPopularResponse {
  hits?: RawPopularHit[];
}

/**
 * Ranks Flathub's own "Popular" collection into a 0-1 score by list
 * position (1 for rank 1, decreasing towards 0 for rank 250) — see
 * `SourcedPackage.popularity`. Apps outside the top 250 get no score at
 * all, never a fake bottom value — this list is a ranking, not a full
 * catalog census. Pure — no I/O.
 */
export function rankPopularity(hits: RawPopularHit[]): Map<string, number> {
  const scores = new Map<string, number>();
  hits.forEach((hit, index) => {
    if (!hit.app_id) return;
    scores.set(hit.app_id, hits.length > 1 ? 1 - index / (hits.length - 1) : 1);
  });
  return scores;
}

async function fetchPopularityRanks(): Promise<Map<string, number>> {
  const response = await fetchOrThrow(POPULAR_URL, "Flathub popular collection");
  const data = (await response.json()) as RawPopularResponse;
  return rankPopularity(data.hits ?? []);
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
): FlathubCacheEntry[] {
  return parseAppstreamXml(xml).map((entry) =>
    Object.assign(entry, {
      iconUrl: resolveIconUrl(entry, REPO_BASE),
      rating: pickOdrsRating(odrsRatings, entry.id),
      popularity: popularityRanks.get(entry.id),
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
  const [xml, odrsRatings, popularityRanks] = await Promise.all([
    fetchGunzippedText(APPSTREAM_URL, "Flathub appstream"),
    fetchOdrsRatings(),
    fetchPopularityRanks(),
  ]);
  const entries = parseAppstream(xml, odrsRatings, popularityRanks);

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
