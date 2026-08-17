import { fetchOrThrow } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import { fetchPrimaryXml, parsePrimaryXml } from "../_shared/rpm-repodata";
import type { FedoraCacheEntry, FedoraFetchMetadata } from "./types";

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
const ARCH = "x86_64";

function repoBasesFor(release: string): string[] {
  return [
    `https://dl.fedoraproject.org/pub/fedora/linux/releases/${release}/Everything/${ARCH}/os`,
    `https://dl.fedoraproject.org/pub/fedora/linux/updates/${release}/Everything/${ARCH}`,
  ];
}

interface BodhiRelease {
  id_prefix: string;
  version: string;
  state: string;
}

/**
 * Resolves the current stable release number from Bodhi's release list —
 * Fedora has no Debian-`stable`-style always-current URL alias (checked:
 * `releases/44/` is a plain numbered directory, no `releases/stable/`
 * symlink), but Bodhi's API is the real equivalent. It marks exactly the
 * currently-supported Fedora releases (not EPEL/ELN, which use the same
 * endpoint) `state: "current"` — typically two at once during the
 * overlap window after a new release ships, so this takes the higher of
 * the two, matching what a fresh install actually gets. Verified against
 * live data (2026-08-17): F43 and F44 both "current", 44 matching this
 * file's previously-hardcoded RELEASE exactly. Pure — no I/O — given an
 * already-fetched release list.
 */
export function resolveCurrentRelease(releases: BodhiRelease[]): string {
  const current = releases
    .filter((release) => release.id_prefix === "FEDORA" && release.state === "current")
    .map((release) => Number.parseInt(release.version, 10))
    .filter((version) => Number.isFinite(version));

  if (current.length === 0) {
    throw new Error("Bodhi reported no current Fedora release");
  }

  return String(Math.max(...current));
}

async function fetchCurrentRelease(): Promise<string> {
  const response = await fetchOrThrow(
    "https://bodhi.fedoraproject.org/releases/?rows_per_page=100",
    "Bodhi releases",
  );
  const { releases } = (await response.json()) as { releases: BodhiRelease[] };
  return resolveCurrentRelease(releases);
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
  const byName = new Map<string, FedoraCacheEntry>();
  for (const entries of repoEntries) {
    for (const entry of entries) byName.set(entry.name, entry);
  }
  return [...byName.values()];
}

/**
 * Downloads Fedora's Everything + updates repodata for the current
 * release/arch (resolved live via Bodhi — see `fetchCurrentRelease` —
 * rather than a hardcoded release number that would silently go stale
 * every ~6 months) and writes the merged, deduplicated entries to
 * `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchFedora(cachePath: string): Promise<number> {
  const release = await fetchCurrentRelease();
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
