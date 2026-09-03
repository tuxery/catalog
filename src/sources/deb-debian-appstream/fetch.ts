import { parseDep11Yaml, type Dep11Document } from "../_shared/dep11";
import { fetchGunzippedText } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { DebianAppstreamCacheEntry, DebianAppstreamFetchMetadata } from "./types";

// Must match deb-debian's SUITE — the AppStream component's `Package:` name
// is a binary package name from the same suite's package index, and the
// exact-appId match tier needs both sides describing the same package set.
// non-free-firmware is skipped: it ships firmware blobs, not apps, and has
// no DEP-11 data at all (checked 2026-09-03).
const SUITE = "stable";
const COMPONENTS = ["main", "contrib", "non-free"] as const;
type DebianComponent = (typeof COMPONENTS)[number];
const ARCH = "amd64";

function dep11Url(component: DebianComponent): string {
  return `https://deb.debian.org/debian/dists/${SUITE}/${component}/dep11/Components-${ARCH}.yml.gz`;
}

/**
 * Maps a DEP-11 document's kept components to cache rows, tagged with the
 * component they came from and with the game-category flag precomputed the
 * same way the Flatpak-family sources do it. Pure — no I/O.
 */
export function toCacheEntries(
  document: Dep11Document,
  component: DebianComponent,
): DebianAppstreamCacheEntry[] {
  return document.components.map((entry) => ({
    id: entry.id,
    component,
    pkgname: entry.pkgname ?? "",
    name: entry.name ?? entry.id,
    summary: entry.summary ?? "",
    iconUrl: entry.iconUrl,
    homepage: entry.homepage,
    hasGameCategory: entry.categories.includes("Game"),
    categories: entry.categories,
    license: entry.license,
    developer: entry.developer,
    longDescription: entry.longDescription,
    screenshots: entry.screenshots,
    languages: entry.languages,
  }));
}

async function fetchComponent(component: DebianComponent): Promise<DebianAppstreamCacheEntry[]> {
  const yaml = await fetchGunzippedText(
    dep11Url(component),
    `Debian component "${component}" DEP-11`,
  );
  return toCacheEntries(parseDep11Yaml(yaml), component);
}

/**
 * Downloads Debian stable's DEP-11 AppStream YAML for main + contrib +
 * non-free (the same components the deb-debian connector indexes) and
 * writes the merged entries to `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchDebianAppstream(cachePath: string): Promise<number> {
  const entriesByComponent = await Promise.all(COMPONENTS.map(fetchComponent));
  const entries = entriesByComponent.flat();

  writeNdjson(cachePath, entries);
  writeMetadata<DebianAppstreamFetchMetadata>(cachePath, {
    source: "deb-debian-appstream",
    fetchedAt: new Date().toISOString(),
    url: COMPONENTS.map(dep11Url).join(", "),
    entryCount: entries.length,
    suite: SUITE,
    component: COMPONENTS.join("+"),
    arch: ARCH,
  });

  return entries.length;
}
