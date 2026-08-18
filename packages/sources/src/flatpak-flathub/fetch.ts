import { parseAppstreamXml, resolveIconUrl } from "../_shared/appstream";
import { fetchGunzippedText } from "../_shared/http";
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

/**
 * Parses Flathub's appstream XML (already decompressed) into cache rows.
 * Mostly a thin wrapper — the actual parsing is shared with elementary
 * AppCenter (another Flatpak remote publishing the identical format) in
 * `_shared/appstream.ts` — but resolves each entry's icon URL here, since
 * that needs Flathub's own repo base, and joins in each entry's ODRS
 * rating (see `_shared/odrs.ts`) by its `.desktop`-suffixed id. Pure — no
 * I/O.
 */
export function parseAppstream(
  xml: string,
  odrsRatings: Map<string, OdrsRating>,
): FlathubCacheEntry[] {
  return parseAppstreamXml(xml).map((entry) =>
    Object.assign(entry, {
      iconUrl: resolveIconUrl(entry, REPO_BASE),
      rating: pickOdrsRating(odrsRatings, entry.id),
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
  const [xml, odrsRatings] = await Promise.all([
    fetchGunzippedText(APPSTREAM_URL, "Flathub appstream"),
    fetchOdrsRatings(),
  ]);
  const entries = parseAppstream(xml, odrsRatings);

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
