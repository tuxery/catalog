import { zstdDecompressSync } from "node:zlib";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import { extractPrimaryLocation, parsePrimaryXml } from "../_shared/rpm-repodata";
import type { FedoraCacheEntry, FedoraFetchMetadata } from "./types";

export { extractPrimaryLocation };

// Fedora publishes one repodata set per release/repo/arch. This fetches
// two repos for the current release/arch: "Everything" (the frozen
// release-day snapshot) and "updates" (an overlay repo with newer package
// versions, and occasionally packages added after release day — a real
// dnf/yum install takes updates over Everything for any name in both).
// Extending to other releases/archs is a straight repeat of this same
// two-step mechanism, not a different one.
//
// mergeByName's per-name dedup means the merged entry count is *lower*
// than the raw entry count from Everything alone used to be, which looks
// like a regression at a glance but isn't: verified against the real
// data that Everything's own primary.xml has 76,354 raw `<package>`
// entries for only 67,430 unique names (arch/subpackage variants sharing
// a name) — those duplicates were always silently in the cache, one
// SourcedPackage row each, before this change. updates then adds 1,560
// genuinely new names on top (e.g. 86box, OpenBoard) — net real coverage
// goes up even though the raw row count goes down.
const RELEASE = "44";
const ARCH = "x86_64";
const REPO_BASES = [
  `https://dl.fedoraproject.org/pub/fedora/linux/releases/${RELEASE}/Everything/${ARCH}/os`,
  `https://dl.fedoraproject.org/pub/fedora/linux/updates/${RELEASE}/Everything/${ARCH}`,
] as const;

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
 * Downloads one repo's repodata — repomd.xml first to find the current
 * content-hashed primary metadata path, then that file itself
 * (Zstandard-compressed; Node's built-in zlib decodes it without a new
 * dependency) — and parses it into cache rows.
 */
async function fetchRepo(repoBase: string): Promise<FedoraCacheEntry[]> {
  const repomdResponse = await fetch(`${repoBase}/repodata/repomd.xml`);
  if (!repomdResponse.ok) {
    throw new Error(
      `Failed to fetch Fedora repomd.xml at ${repoBase}: ${repomdResponse.status} ${repomdResponse.statusText}`,
    );
  }

  const repomdXml = await repomdResponse.text();
  const primaryLocation = extractPrimaryLocation(repomdXml);
  if (!primaryLocation) {
    throw new Error(`Fedora repomd.xml at ${repoBase} has no primary data location`);
  }

  const primaryUrl = `${repoBase}/${primaryLocation}`;
  const primaryResponse = await fetch(primaryUrl);
  if (!primaryResponse.ok) {
    throw new Error(
      `Failed to fetch Fedora primary metadata at ${primaryUrl}: ${primaryResponse.status} ${primaryResponse.statusText}`,
    );
  }

  const compressed = Buffer.from(await primaryResponse.arrayBuffer());
  const xml = zstdDecompressSync(compressed).toString("utf8");
  return parsePrimary(xml);
}

/**
 * Merges Everything + updates by name, later repos in `repoEntries`
 * winning ties — matches real dnf/yum behavior, where the updates repo
 * always takes precedence over the release-day snapshot for the same
 * package name. Pure — no I/O.
 */
export function mergeByName(repoEntries: FedoraCacheEntry[][]): FedoraCacheEntry[] {
  const byName = new Map<string, FedoraCacheEntry>();
  for (const entries of repoEntries) {
    for (const entry of entries) byName.set(entry.name, entry);
  }
  return [...byName.values()];
}

/**
 * Downloads Fedora's Everything + updates repodata for one release/arch
 * and writes the merged, deduplicated entries to `cachePath` as NDJSON.
 * See docs/sources.md.
 */
export async function fetchFedora(cachePath: string): Promise<number> {
  const repoEntries = await Promise.all(REPO_BASES.map(fetchRepo));
  const entries = mergeByName(repoEntries);

  writeNdjson(cachePath, entries);
  writeMetadata<FedoraFetchMetadata>(cachePath, {
    source: "rpm-fedora",
    fetchedAt: new Date().toISOString(),
    url: REPO_BASES.join(", "),
    entryCount: entries.length,
    release: RELEASE,
    arch: ARCH,
  });

  return entries.length;
}
