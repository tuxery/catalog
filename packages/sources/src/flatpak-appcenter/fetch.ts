import { parseAppstreamXml, resolveIconUrl } from "../_shared/appstream";
import { fetchGunzippedText } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { AppCenterCacheEntry, AppCenterFetchMetadata } from "./types";

// elementary AppCenter is its own Flatpak remote (not Flathub) -- same
// appstream.xml.gz mechanism, verified identical schema against real
// data, parsing shared via _shared/appstream.ts. ~136 curated, reviewed,
// pay-what-you-can apps built specifically for elementary OS -- a
// genuinely distinct channel, not a reskinned Flathub subset: verified
// against the real Flathub cache that only 32 of 147 AppCenter app IDs
// also exist on Flathub (which the existing exact-appId matching tier
// already merges correctly) -- the other 115 are exclusive to AppCenter.
const ARCH = "x86_64";
const REPO_BASE = `https://flatpak.elementary.io/repo/appstream/${ARCH}`;
const APPSTREAM_URL = `${REPO_BASE}/appstream.xml.gz`;

/**
 * Parses elementary AppCenter's appstream XML (already decompressed)
 * into cache rows. Mostly a thin wrapper — the actual parsing is shared
 * with Flathub in `_shared/appstream.ts` — but resolves each entry's
 * icon URL here, since that needs AppCenter's own repo base (only ~8%
 * of its real components carry a ready-to-use `remoteIconUrl`, unlike
 * Flathub's 100%, so this fallback carries most of AppCenter's real
 * icon coverage). Pure — no I/O.
 */
export function parseAppstream(xml: string): AppCenterCacheEntry[] {
  return parseAppstreamXml(xml).map((entry) =>
    Object.assign(entry, { iconUrl: resolveIconUrl(entry, REPO_BASE) }),
  );
}

/**
 * Downloads elementary AppCenter's appstream repodata and writes the
 * normalized entries to `cachePath` as NDJSON. Single gzipped XML file,
 * no auth, no pagination — see docs/sources.md.
 */
export async function fetchAppCenter(cachePath: string): Promise<number> {
  const xml = await fetchGunzippedText(APPSTREAM_URL, "elementary AppCenter appstream");
  const entries = parseAppstream(xml);

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
