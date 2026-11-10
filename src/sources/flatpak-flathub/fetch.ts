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
// Flathub's separate beta repo (opt-in in the Flatpak client: `flatpak remote-add
// flathub-beta`), a different set of builds of its own: the apps' beta branch,
// the `beta` risk (docs/product-families.md), not a track.
const BETA_REPO_BASE = `https://dl.flathub.org/beta-repo/appstream/${ARCH}`;
const BETA_APPSTREAM_URL = `${BETA_REPO_BASE}/appstream.xml.gz`;

// Only these repo files, never flathub.org's API. Until 2026-11-14 we also
// called /api/v2/stats and /summary per app (about 8,900 requests a week)
// and /api/v2/collection; Flathub said on 2026-11-10 that scraping their
// API is not welcome, and pointed to appstream.xml instead. Installs,
// download size, permissions and the Popular/recently-added/updated lists
// came only from the API and are gone; "verified" is in the appstream.

const VERIFIED_MARK = '<value key="flathub::verification::verified">true</value>';

/**
 * Ids of the components Flathub marks verified in its appstream, from the
 * `flathub::verification::verified` custom key (2,556 of them on
 * 2026-11-10). A plain scan: the shared parser doesn't keep custom keys.
 * Pure — no I/O.
 */
export function verifiedIds(xml: string): Set<string> {
  const ids = new Set<string>();
  for (const [block] of xml.matchAll(/<component\b[\s\S]*?<\/component>/g)) {
    if (!block.includes(VERIFIED_MARK)) continue;
    const id = /<id>\s*([^<\s]+)\s*<\/id>/.exec(block)?.[1];
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Parses Flathub's appstream XML (already decompressed) into cache rows.
 * Mostly a thin wrapper — parsing itself is shared with elementary
 * AppCenter (another Flatpak remote publishing the identical format) in
 * `_shared/appstream.ts` — but resolves each entry's icon URL against
 * Flathub's own repo base, and joins in its ODRS rating (see
 * `_shared/odrs.ts`), and marks the verified ones (`verifiedIds`). Pure —
 * no I/O.
 */
export function parseAppstream(
  xml: string,
  odrsRatings: Map<string, OdrsRating>,
): FlathubCacheEntry[] {
  const verified = verifiedIds(xml);
  return parseAppstreamXml(xml, { includeAddons: true }).map((entry) =>
    Object.assign(entry, {
      iconUrl: resolveIconUrl(entry, REPO_BASE),
      rating: pickOdrsRating(odrsRatings, entry.id),
      storeCollections: verified.has(entry.id) ? ["verified" as const] : undefined,
    }),
  );
}

/**
 * Parses the beta repo's appstream XML into cache rows marked `branch:
 * "beta"`. Apps only (an add-on of a beta app is not worth a row), without the
 * stable repo's joins: its ratings and verification describe the stable app.
 * Pure — no I/O.
 */
export function parseBetaAppstream(xml: string): FlathubCacheEntry[] {
  return parseAppstreamXml(xml, { includeAddons: false }).map((entry) =>
    Object.assign(entry, {
      iconUrl: resolveIconUrl(entry, BETA_REPO_BASE),
      branch: "beta" as const,
    }),
  );
}

/** The beta repo's rows, or none when it can't be read: a failing beta repo must not cost the stable one. */
async function fetchBetaEntries(): Promise<FlathubCacheEntry[]> {
  try {
    return parseBetaAppstream(
      await fetchGunzippedText(BETA_APPSTREAM_URL, "Flathub beta appstream"),
    );
  } catch (error) {
    console.warn(`Flathub beta repo skipped: ${String(error)}`);
    return [];
  }
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
  const entries = [...parseAppstream(xml, odrsRatings), ...(await fetchBetaEntries())];

  writeNdjson(cachePath, entries);
  writeMetadata<FlathubFetchMetadata>(cachePath, {
    source: "flatpak-flathub",
    fetchedAt: new Date().toISOString(),
    url: `${APPSTREAM_URL}, ${BETA_APPSTREAM_URL}`,
    entryCount: entries.length,
    arch: ARCH,
  });

  return entries.length;
}
