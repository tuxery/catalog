import { zstdDecompressSync } from "node:zlib";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import { extractPrimaryLocation, parsePrimaryXml } from "../_shared/rpm-repodata";
import type { OpenSuseCacheEntry, OpenSuseFetchMetadata } from "./types";

export { extractPrimaryLocation };

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
// real data that's only ever "x86_64" or "noarch" (verified: oss's 52,482
// entries split exactly into 24,777 x86_64 + 27,705 noarch, no i586/src/
// other arch mixed in), so no arch filtering is needed either.
const REPOS = [
  { id: "oss", base: "https://download.opensuse.org/tumbleweed/repo/oss" },
  { id: "non-oss", base: "https://download.opensuse.org/tumbleweed/repo/non-oss" },
] as const;

/**
 * Parses openSUSE's primary.xml (already decompressed) into cache rows,
 * tagged with which repo they came from. Pure — no I/O.
 */
export function parsePrimary(xml: string, repo: OpenSuseCacheEntry["repo"]): OpenSuseCacheEntry[] {
  return parsePrimaryXml(xml).map(
    ({ name, summary, version, homepage, group, hasDesktopFile }) => ({
      name,
      summary,
      version,
      homepage,
      repo,
      group,
      hasDesktopFile,
    }),
  );
}

/**
 * Downloads one repo's repodata — repomd.xml first to find the current
 * content-hashed primary metadata path, then that file itself
 * (Zstandard-compressed; Node's built-in zlib decodes it without a new
 * dependency) — and parses it into cache rows. `download.opensuse.org`
 * 302-redirects to the actual mirror; Node's `fetch()` follows that
 * transparently, same as a browser, so no special handling is needed.
 */
async function fetchRepo(repo: (typeof REPOS)[number]): Promise<OpenSuseCacheEntry[]> {
  const repomdResponse = await fetch(`${repo.base}/repodata/repomd.xml`);
  if (!repomdResponse.ok) {
    throw new Error(
      `Failed to fetch openSUSE repomd.xml at ${repo.base}: ${repomdResponse.status} ${repomdResponse.statusText}`,
    );
  }

  const repomdXml = await repomdResponse.text();
  const primaryLocation = extractPrimaryLocation(repomdXml);
  if (!primaryLocation) {
    throw new Error(`openSUSE repomd.xml at ${repo.base} has no primary data location`);
  }

  const primaryUrl = `${repo.base}/${primaryLocation}`;
  const primaryResponse = await fetch(primaryUrl);
  if (!primaryResponse.ok) {
    throw new Error(
      `Failed to fetch openSUSE primary metadata at ${primaryUrl}: ${primaryResponse.status} ${primaryResponse.statusText}`,
    );
  }

  const compressed = Buffer.from(await primaryResponse.arrayBuffer());
  const xml = zstdDecompressSync(compressed).toString("utf8");
  return parsePrimary(xml, repo.id);
}

/**
 * Downloads openSUSE Tumbleweed's oss + non-oss repodata for one arch and
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
    reposFetched: REPOS.map((repo) => repo.id),
  });

  return entries.length;
}
