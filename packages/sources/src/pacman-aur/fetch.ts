import { fetchGunzippedText } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { AurCacheEntry, AurFetchMetadata } from "./types";

const PACKAGES_URL = "https://aur.archlinux.org/packages-meta-ext-v1.json.gz";

interface RawPackage {
  Name?: string;
  Description?: string | null;
  Version?: string;
  URL?: string | null;
}

/**
 * Maps the AUR's raw metadata dump entries to cache rows. Pure — no I/O —
 * so it's the part covered by tests.
 */
export function mapPackages(packages: RawPackage[]): AurCacheEntry[] {
  const entries: AurCacheEntry[] = [];

  for (const pkg of packages) {
    if (!pkg.Name) continue;

    entries.push({
      name: pkg.Name,
      description: pkg.Description ?? "",
      version: pkg.Version ?? "unknown",
      homepage: pkg.URL ?? undefined,
    });
  }

  return entries;
}

/**
 * Downloads the AUR's full metadata dump — a single gzipped JSON array,
 * regenerated every ~5 minutes, no auth, no pagination — and writes the
 * normalized entries to `cachePath` as NDJSON. ~117k packages; see
 * docs/sources.md and @tuxery/curator's match/group.ts for why grouping
 * this many needs bucketed comparison, not naive pairwise scoring.
 */
export async function fetchAur(cachePath: string): Promise<number> {
  const json = await fetchGunzippedText(PACKAGES_URL, "AUR metadata dump");
  const packages = JSON.parse(json) as RawPackage[];
  const entries = mapPackages(packages);

  writeNdjson(cachePath, entries);
  writeMetadata<AurFetchMetadata>(cachePath, {
    source: "pacman-aur",
    fetchedAt: new Date().toISOString(),
    url: PACKAGES_URL,
    entryCount: entries.length,
  });

  return entries.length;
}
