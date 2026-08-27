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
  Popularity?: number;
}

/**
 * Ranks every package with real `Popularity` (AUR's own decayed
 * usage-frequency metric — a raw float whose scale is meaningless on its
 * own) into a 0-1 percentile score comparable across sources — see
 * `SourcedPackage.popularity`. Packages with zero/no `Popularity` (most
 * AUR packages, since they're simply never installed via a helper that
 * reports usage) get no score at all, not a fake bottom-percentile value.
 * Pure — no I/O.
 */
export function rankPopularity(packages: RawPackage[]): Map<string, number> {
  const ranked = packages.filter(
    (pkg): pkg is RawPackage & { Name: string; Popularity: number } =>
      Boolean(pkg.Name) && Boolean(pkg.Popularity),
  );
  // .sort() mutates in place, but `ranked` is already a fresh array from
  // .filter() above, not a reference the caller can see — safe.
  // eslint-disable-next-line unicorn/no-array-sort
  ranked.sort((a, b) => b.Popularity - a.Popularity);

  const scores = new Map<string, number>();
  ranked.forEach((pkg, index) => {
    scores.set(pkg.Name, ranked.length > 1 ? 1 - index / (ranked.length - 1) : 1);
  });
  return scores;
}

/**
 * Maps the AUR's raw metadata dump entries to cache rows. Pure — no I/O —
 * so it's the part covered by tests.
 */
export function mapPackages(
  packages: RawPackage[],
  popularityRanks: Map<string, number>,
): AurCacheEntry[] {
  const entries: AurCacheEntry[] = [];

  for (const pkg of packages) {
    if (!pkg.Name) continue;

    entries.push({
      name: pkg.Name,
      description: pkg.Description ?? "",
      version: pkg.Version ?? "unknown",
      homepage: pkg.URL ?? undefined,
      popularity: popularityRanks.get(pkg.Name),
    });
  }

  return entries;
}

/**
 * Downloads the AUR's full metadata dump — a single gzipped JSON array,
 * regenerated every ~5 minutes, no auth, no pagination — and writes the
 * normalized entries to `cachePath` as NDJSON. ~117k packages; see
 * docs/sources.md and the curator module's match/group.ts for why grouping
 * this many needs bucketed comparison, not naive pairwise scoring.
 */
export async function fetchAur(cachePath: string): Promise<number> {
  const json = await fetchGunzippedText(PACKAGES_URL, "AUR metadata dump");
  const packages = JSON.parse(json) as RawPackage[];
  const entries = mapPackages(packages, rankPopularity(packages));

  writeNdjson(cachePath, entries);
  writeMetadata<AurFetchMetadata>(cachePath, {
    source: "pacman-aur",
    fetchedAt: new Date().toISOString(),
    url: PACKAGES_URL,
    entryCount: entries.length,
  });

  return entries.length;
}
