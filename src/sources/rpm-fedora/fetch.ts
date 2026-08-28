import { dedupeByKey } from "../_shared/dedupe";
import { fetchCurrentFedoraRelease } from "../_shared/fedora-release";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import { fetchPrimaryXml, parsePrimaryXml } from "../_shared/rpm-repodata";
import type { FedoraCacheEntry, FedoraFetchMetadata } from "./types";

// Fedora publishes one repodata set per release/repo/arch. This fetches
// two repos for the current release/arch: "Everything" (the frozen
// release-day snapshot) and "updates" (an overlay repo with newer package
// versions, and occasionally packages added after release day — a real
// dnf/yum install takes updates over Everything for any name in both).
//
// mergeByName's per-name dedup means the merged entry count is *lower*
// than the raw entry count from Everything alone used to be, which looks
// like a regression at a glance but isn't: Everything's primary.xml has
// duplicate `<package>` entries for the same name (arch/subpackage
// variants sharing a name) that were always silently collapsed to one
// SourcedPackage row downstream; updates then adds genuinely new names on
// top — net real coverage goes up even though the raw row count goes down.
const ARCH = "x86_64";

function repoBasesFor(release: string): string[] {
  return [
    `https://dl.fedoraproject.org/pub/fedora/linux/releases/${release}/Everything/${ARCH}/os`,
    `https://dl.fedoraproject.org/pub/fedora/linux/updates/${release}/Everything/${ARCH}`,
  ];
}

/**
 * Parses Fedora's primary.xml (already decompressed) into cache rows.
 * Fedora's `<rpm:group>` is unused upstream in practice ("Unspecified" on
 * real data), so it's dropped here rather than threaded into
 * `FedoraCacheEntry` — see `_shared/rpm-repodata.ts`'s `parsePrimaryXml`,
 * shared with openSUSE, which does populate it. `hasDesktopFile` (a
 * genuine, if low-coverage, GUI-app signal — see `parsePrimaryXml`'s own
 * comment) is kept. Pure — no I/O.
 */
export function parsePrimary(xml: string): FedoraCacheEntry[] {
  return parsePrimaryXml(xml).map(({ name, summary, version, homepage, hasDesktopFile }) => ({
    name,
    summary,
    version,
    homepage,
    hasDesktopFile,
  }));
}

/**
 * Downloads one repo's repodata (see `_shared/rpm-repodata.ts`'s
 * `fetchPrimaryXml` for the repomd.xml -> primary.xml.zst mechanics,
 * shared with openSUSE) and parses it into cache rows.
 */
async function fetchRepo(repoBase: string): Promise<FedoraCacheEntry[]> {
  const xml = await fetchPrimaryXml(repoBase, "Fedora");
  return parsePrimary(xml);
}

/**
 * Merges Everything + updates by name, later repos in `repoEntries`
 * winning ties — matches real dnf/yum behavior, where the updates repo
 * always takes precedence over the release-day snapshot for the same
 * package name. Pure — no I/O.
 */
export function mergeByName(repoEntries: FedoraCacheEntry[][]): FedoraCacheEntry[] {
  return dedupeByKey(repoEntries.flat(), (entry) => entry.name);
}

/**
 * Downloads Fedora's Everything + updates repodata for the current
 * release/arch (resolved live via Bodhi — see `fetchCurrentFedoraRelease` —
 * rather than a hardcoded release number that would silently go stale
 * every ~6 months) and writes the merged, deduplicated entries to
 * `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchFedora(cachePath: string): Promise<number> {
  const release = await fetchCurrentFedoraRelease();
  const repoBases = repoBasesFor(release);
  const repoEntries = await Promise.all(repoBases.map(fetchRepo));
  const entries = mergeByName(repoEntries);

  writeNdjson(cachePath, entries);
  writeMetadata<FedoraFetchMetadata>(cachePath, {
    source: "rpm-fedora",
    fetchedAt: new Date().toISOString(),
    url: repoBases.join(", "),
    entryCount: entries.length,
    release,
    arch: ARCH,
  });

  return entries.length;
}
