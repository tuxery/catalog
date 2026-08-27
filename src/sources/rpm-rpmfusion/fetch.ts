import { fetchCurrentFedoraRelease } from "../_shared/fedora-release";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import { fetchPrimaryXml, parsePrimaryXml } from "../_shared/rpm-repodata";
import type { RpmFusionCacheEntry, RpmFusionFetchMetadata } from "./types";

// RPM Fusion is the addon repo behind Fedora's own "enable third-party
// repositories" installer option — codecs, NVIDIA drivers, Steam, VLC,
// OBS, and other packages Fedora's own repo can't ship for licensing
// reasons. Same repomd.xml/primary.xml schema as Fedora's own repo (and
// reuses that release number — it tracks Fedora releases 1:1), but
// gzip-compressed rather than Fedora/openSUSE's zstd — see
// `_shared/rpm-repodata.ts`'s `fetchPrimaryXml`, which picks the right
// decompressor from the file extension either way.
const ARCH = "x86_64";

function repoBasesFor(release: string): string[] {
  return [
    `https://download1.rpmfusion.org/free/fedora/releases/${release}/Everything/${ARCH}/os`,
    `https://download1.rpmfusion.org/nonfree/fedora/releases/${release}/Everything/${ARCH}/os`,
    `https://download1.rpmfusion.org/free/fedora/updates/${release}/${ARCH}`,
    `https://download1.rpmfusion.org/nonfree/fedora/updates/${release}/${ARCH}`,
  ];
}

/**
 * Parses RPM Fusion's primary.xml (already decompressed) into cache rows.
 * Keeps `<rpm:group>` (unlike `rpm-fedora/fetch.ts`'s `parsePrimary`,
 * which drops it) — real, non-"Unspecified" values here, including
 * "Amusements/Games" for real games. Pure — no I/O.
 */
export function parsePrimary(xml: string): RpmFusionCacheEntry[] {
  return parsePrimaryXml(xml).map(
    ({ name, summary, version, homepage, group, hasDesktopFile }) => ({
      name,
      summary,
      version,
      homepage,
      group,
      hasDesktopFile,
    }),
  );
}

async function fetchRepo(repoBase: string): Promise<RpmFusionCacheEntry[]> {
  const xml = await fetchPrimaryXml(repoBase, "RPM Fusion");
  return parsePrimary(xml);
}

/**
 * Merges free + nonfree + their respective updates repos by name, later
 * repos winning ties — an updates repo always takes precedence over its
 * own base repo, matching real dnf/yum behavior (same reasoning as
 * `rpm-fedora/fetch.ts`'s `mergeByName`, which this mirrors). Pure — no
 * I/O.
 */
export function mergeByName(repoEntries: RpmFusionCacheEntry[][]): RpmFusionCacheEntry[] {
  const byName = new Map<string, RpmFusionCacheEntry>();
  for (const entries of repoEntries) {
    for (const entry of entries) byName.set(entry.name, entry);
  }
  return [...byName.values()];
}

/**
 * Downloads RPM Fusion's free + nonfree + updates repodata for the
 * current Fedora release/arch (resolved live via Bodhi, same as
 * `rpm-fedora/fetch.ts` — RPM Fusion tracks Fedora's release number
 * directly) and writes the merged, deduplicated entries to `cachePath` as
 * NDJSON. See docs/sources.md.
 */
export async function fetchRpmFusion(cachePath: string): Promise<number> {
  const release = await fetchCurrentFedoraRelease();
  const repoBases = repoBasesFor(release);
  const repoEntries = await Promise.all(repoBases.map(fetchRepo));
  const entries = mergeByName(repoEntries);

  writeNdjson(cachePath, entries);
  writeMetadata<RpmFusionFetchMetadata>(cachePath, {
    source: "rpm-rpmfusion",
    fetchedAt: new Date().toISOString(),
    url: repoBases.join(", "),
    entryCount: entries.length,
    release,
    arch: ARCH,
  });

  return entries.length;
}
