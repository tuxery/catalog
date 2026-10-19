import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import { fetchPrimaryXml, parsePrimaryXml } from "../_shared/rpm-repodata";
import { LEAP_TRACK, type OpenSuseCacheEntry, type OpenSuseFetchMetadata } from "./types";

// openSUSE Tumbleweed (the rolling release, so there's no version number to
// pin the way Fedora pins a release) publishes the same repomd.xml ->
// content-hashed primary.xml[.zst] repodata as Fedora — see
// `_shared/rpm-repodata.ts`. Two repos, "oss" (the main free-software repo)
// and "non-oss" (proprietary/restricted, same organizing principle as
// Debian's non-free) — unlike Fedora's Everything/updates, these are
// disjoint components rather than overlapping snapshots, so no by-name
// merge/precedence logic is needed, just a concatenation.
//
// Unlike Fedora, there's no per-arch repo directory to pick — each repo's
// primary.xml already bundles every package's `<arch>` in one file, and on
// real data that's only ever "x86_64" or "noarch", so no arch filtering is
// needed either.
//
// Leap, the numbered release most desktops and servers run, is a different
// distribution (built from SUSE Linux Enterprise) with its own package set and
// versions: its repos are fetched too, as a track of their own
// (docs/product-families.md) next to Tumbleweed, the default line.
const ORIGIN = "https://downloadcontent.opensuse.org";
const REPOS = [
  { id: "oss", base: `${ORIGIN}/tumbleweed/repo/oss` },
  { id: "non-oss", base: `${ORIGIN}/tumbleweed/repo/non-oss` },
  { id: "oss", base: `${ORIGIN}/distribution/leap/16.0/repo/oss/x86_64`, track: LEAP_TRACK },
  {
    id: "non-oss",
    base: `${ORIGIN}/distribution/leap/16.0/repo/non-oss/x86_64`,
    track: LEAP_TRACK,
  },
] as const;

/**
 * Parses openSUSE's primary.xml (already decompressed) into cache rows,
 * tagged with which repo they came from. Pure — no I/O.
 */
export function parsePrimary(xml: string, repo: OpenSuseCacheEntry["repo"]): OpenSuseCacheEntry[] {
  return parsePrimaryXml(xml).map(
    ({
      name,
      summary,
      version,
      homepage,
      group,
      hasDesktopFile,
      license,
      builtAt,
      installedSizeBytes,
      formal,
    }) => ({
      name,
      summary,
      version,
      homepage,
      repo,
      group,
      hasDesktopFile,
      license,
      builtAt,
      installedSizeBytes,
      formal,
    }),
  );
}

/**
 * Downloads one repo's repodata (see `_shared/rpm-repodata.ts`'s
 * `fetchPrimaryXml` for the repomd.xml -> primary.xml.zst mechanics,
 * shared with Fedora) and parses it into cache rows.
 * Read from `downloadcontent.opensuse.org`, SUSE's origin content server,
 * not `download.opensuse.org`: Tumbleweed is republished many times a day
 * and the latter 302-redirects to a geographic mirror that may not have the
 * newest hash-named repodata files yet, so `repomd.xml` lists a file the
 * mirror 404s on (seen 2026-10-04 from a mirror in Ukraine, for both this
 * connector and the AppStream one, identically on retry). The origin serves
 * `repomd.xml` and the files it names as one consistent snapshot.
 */
async function fetchRepo(repo: (typeof REPOS)[number]): Promise<OpenSuseCacheEntry[]> {
  const xml = await fetchPrimaryXml(repo.base, "openSUSE");
  const entries = parsePrimary(xml, repo.id);
  return "track" in repo ? entries.map((entry) => ({ ...entry, track: repo.track })) : entries;
}

/**
 * Downloads openSUSE Tumbleweed's and Leap's oss + non-oss repodata and
 * writes the concatenated entries to `cachePath` as NDJSON. See
 * docs/sources.md.
 */
export async function fetchOpenSuse(cachePath: string): Promise<number> {
  const repoEntries = await Promise.all(REPOS.map(fetchRepo));
  const entries = repoEntries.flat();

  writeNdjson(cachePath, entries);
  writeMetadata<OpenSuseFetchMetadata>(cachePath, {
    source: "rpm-opensuse",
    fetchedAt: new Date().toISOString(),
    url: REPOS.map((repo) => repo.base).join(", "),
    entryCount: entries.length,
    reposFetched: REPOS.map((repo) => ("track" in repo ? `${repo.track}/${repo.id}` : repo.id)),
  });

  return entries.length;
}
