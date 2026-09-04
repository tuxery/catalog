import { dirname, join } from "node:path";
import { parseDep11Yaml, type Dep11Document } from "../_shared/dep11";
import { fetchGunzippedText } from "../_shared/http";
import { fetchCurrentSuite } from "../_shared/ubuntu-suite";
import { readMetadata, writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { UbuntuFetchMetadata } from "../deb-ubuntu/types";
import type { UbuntuAppstreamCacheEntry, UbuntuAppstreamFetchMetadata } from "./types";

// Must match deb-ubuntu's suite exactly: the DEP-11 component's `Package:`
// name is a binary package name from the same suite's package index, and
// the exact-appId match tier needs both sides describing the same package
// set. Resolving this connector's own suite independently (a second live
// Launchpad call) only guarantees "close enough in time" — real risk
// found live 2026-09-03 reviewing this connector: two separate
// `pnpm run refresh` invocations (this repo's own per-source CLI/CI
// model) racing Launchpad's "Current Stable Release" marker flipping on a
// release day would silently key the two caches to different suites. So
// `resolveSuite` below reads deb-ubuntu's own already-written
// `cache/deb-ubuntu.meta.json` instead of re-resolving from Launchpad —
// guaranteed identical, not just probably identical — and only falls
// back to a fresh `fetchCurrentSuite()` call when that metadata doesn't
// exist yet (first-ever cold start, or run out of order).
//
// main/universe/multiverse only — restricted is 404 on dep11 for the same
// reason it ships no DEP-11 data at all: binary/proprietary drivers, no
// apps (checked 2026-09-03). universe is the one that matters: Ubuntu's
// main/universe split is by support tier, and most desktop apps live in
// universe.
const COMPONENTS = ["main", "universe", "multiverse"] as const;
type UbuntuComponent = (typeof COMPONENTS)[number];
const ARCH = "amd64";

/**
 * The suite to fetch DEP-11 data for — deb-ubuntu's own recorded suite
 * when its cache already exists (the common case: this connector reuses
 * the exact value rather than re-resolving it), else a fresh Launchpad
 * lookup (bootstrap-only fallback). `cachePath` is this connector's own
 * `cache/deb-ubuntu-appstream.ndjson` path; deb-ubuntu's sits alongside
 * it under the fixed `cache/<source>.ndjson` naming `refresh.ts` uses.
 */
async function resolveSuite(cachePath: string): Promise<string> {
  const ubuntuCachePath = join(dirname(cachePath), "deb-ubuntu.ndjson");
  const ubuntuMetadata = readMetadata<UbuntuFetchMetadata>(ubuntuCachePath);
  return ubuntuMetadata?.suite ?? fetchCurrentSuite();
}

function dep11Url(suite: string, component: UbuntuComponent): string {
  return `https://archive.ubuntu.com/ubuntu/dists/${suite}/${component}/dep11/Components-${ARCH}.yml.gz`;
}

/**
 * Maps a DEP-11 document's kept components to cache rows, tagged with the
 * component they came from and with the game-category flag precomputed the
 * same way the Flatpak-family sources do it. Pure — no I/O.
 */
export function toCacheEntries(
  document: Dep11Document,
  component: UbuntuComponent,
): UbuntuAppstreamCacheEntry[] {
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

async function fetchComponent(
  suite: string,
  component: UbuntuComponent,
): Promise<UbuntuAppstreamCacheEntry[]> {
  const yaml = await fetchGunzippedText(dep11Url(suite, component), `Ubuntu component "${component}" DEP-11`);
  return toCacheEntries(parseDep11Yaml(yaml), component);
}

/**
 * Downloads Ubuntu's DEP-11 AppStream YAML for the current release's
 * main + universe + multiverse and writes the merged entries to
 * `cachePath` as NDJSON — each row keeps its source component. See
 * docs/sources.md.
 */
export async function fetchUbuntuAppstream(cachePath: string): Promise<number> {
  const suite = await resolveSuite(cachePath);
  const entriesByComponent = await Promise.all(
    COMPONENTS.map((component) => fetchComponent(suite, component)),
  );
  const entries = entriesByComponent.flat();

  writeNdjson(cachePath, entries);
  writeMetadata<UbuntuAppstreamFetchMetadata>(cachePath, {
    source: "deb-ubuntu-appstream",
    fetchedAt: new Date().toISOString(),
    url: COMPONENTS.map((component) => dep11Url(suite, component)).join(", "),
    entryCount: entries.length,
    suite,
    component: COMPONENTS.join("+"),
    arch: ARCH,
  });

  return entries.length;
}
