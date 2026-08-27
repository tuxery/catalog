import { parseAppstreamXml, resolveIconUrl } from "../_shared/appstream";
import { fetchGunzippedText } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import { fetchOdrsRatings, pickOdrsRating, type OdrsRating } from "../_shared/odrs";
import type { AppCenterCacheEntry, AppCenterFetchMetadata } from "./types";

// elementary AppCenter is its own Flatpak remote (not Flathub) -- same
// appstream.xml.gz mechanism, parsing shared via _shared/appstream.ts.
// ~136 curated, reviewed, pay-what-you-can apps built for elementary OS --
// a genuinely distinct channel, not a reskinned Flathub subset: most
// AppCenter app IDs don't exist on Flathub at all (the existing
// exact-appId matching tier merges the ones that do).
const ARCH = "x86_64";
const REPO_BASE = `https://flatpak.elementary.io/repo/appstream/${ARCH}`;
const APPSTREAM_URL = `${REPO_BASE}/appstream.xml.gz`;

/**
 * Parses elementary AppCenter's appstream XML (already decompressed)
 * into cache rows. Mostly a thin wrapper — parsing itself is shared with
 * Flathub in `_shared/appstream.ts` — but resolves each entry's icon URL
 * against AppCenter's own repo base, since most of its components have no
 * ready-to-use `remoteIconUrl` (unlike Flathub), so this fallback carries
 * most of AppCenter's real icon coverage. Also joins in each entry's ODRS
 * rating (see `_shared/odrs.ts`) by its `.desktop`-suffixed id. Pure — no
 * I/O.
 */
export function parseAppstream(
  xml: string,
  odrsRatings: Map<string, OdrsRating>,
): AppCenterCacheEntry[] {
  return parseAppstreamXml(xml).map((entry) =>
    Object.assign(entry, {
      iconUrl: resolveIconUrl(entry, REPO_BASE),
      rating: pickOdrsRating(odrsRatings, entry.id),
    }),
  );
}

/**
 * Downloads elementary AppCenter's appstream repodata and writes the
 * normalized entries to `cachePath` as NDJSON. Single gzipped XML file,
 * no auth, no pagination — see docs/sources.md.
 */
export async function fetchAppCenter(cachePath: string): Promise<number> {
  const [xml, odrsRatings] = await Promise.all([
    fetchGunzippedText(APPSTREAM_URL, "elementary AppCenter appstream"),
    fetchOdrsRatings(),
  ]);
  const entries = parseAppstream(xml, odrsRatings);

  writeNdjson(cachePath, entries);
  writeMetadata<AppCenterFetchMetadata>(cachePath, {
    source: "flatpak-appcenter",
    fetchedAt: new Date().toISOString(),
    url: APPSTREAM_URL,
    entryCount: entries.length,
    arch: ARCH,
  });

  return entries.length;
}
