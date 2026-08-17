import { parseAppstreamXml } from "../_shared/appstream";
import { fetchGunzippedText } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { FlathubCacheEntry, FlathubFetchMetadata } from "./types";

// Flathub publishes one appstream file per arch — this is the one most
// desktop Linux installs actually run on. aarch64 is available at the same
// path with the arch swapped, if/when Tuxery needs it.
const ARCH = "x86_64";
const APPSTREAM_URL = `https://dl.flathub.org/repo/appstream/${ARCH}/appstream.xml.gz`;

/**
 * Parses Flathub's appstream XML (already decompressed) into cache rows.
 * A thin wrapper — the actual parsing is shared with elementary AppCenter
 * (another Flatpak remote publishing the identical format) in
 * `_shared/appstream.ts`. Pure — no I/O.
 */
export function parseAppstream(xml: string): FlathubCacheEntry[] {
  return parseAppstreamXml(xml);
}

/**
 * Downloads Flathub's appstream repodata — the same file real Flatpak
 * clients use to discover apps — and writes the normalized entries to
 * `cachePath` as NDJSON. Single gzipped XML file, no auth, no pagination;
 * see docs/sources.md.
 */
export async function fetchFlathub(cachePath: string): Promise<number> {
  const xml = await fetchGunzippedText(APPSTREAM_URL, "Flathub appstream");
  const entries = parseAppstream(xml);

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
