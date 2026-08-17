import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tar from "tar";
import { fetchOrThrow } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { AlpineCacheEntry, AlpineFetchMetadata } from "./types";

// Alpine publishes one APKINDEX.tar.gz per repo/arch under "latest-stable"
// -- a server-side alias that always resolves to the current stable
// release, unlike Fedora/Ubuntu's hardcoded release-number fetchers (see
// the "pin a hardcoded release" card) -- so this one doesn't need periodic
// bumping. Two repos, "main" (Alpine-team-maintained) and "community"
// (broader, community-maintained) -- disjoint, zero name collisions
// verified against the real data, so a plain concatenation is enough,
// same as openSUSE's oss/non-oss.
const ARCH = "x86_64";
const REPOS = ["main", "community"] as const;
const BASE = "https://dl-cdn.alpinelinux.org/alpine/latest-stable";

/**
 * Parses APKINDEX's stanza format — single-letter field prefixes
 * (`P:name`, `V:version`, `T:summary`, `U:homepage`, ...), one stanza per
 * package, blank-line separated. Unlike deb822, every field is exactly
 * one line — no continuation-line handling needed (`T`, the short
 * description, is the only description field APKINDEX has at all;
 * verified against the real index that no field spans multiple lines).
 * Pure — no I/O — so it's covered by tests, same as `mapStanzas`.
 */
export function parseApkindex(text: string): Record<string, string>[] {
  const stanzas: Record<string, string>[] = [];

  for (const block of text.split(/\r?\n\r?\n+/)) {
    const fields: Record<string, string> = {};

    for (const line of block.split(/\r?\n/)) {
      if (line === "") continue;
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) continue;
      fields[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
    }

    if (Object.keys(fields).length > 0) stanzas.push(fields);
  }

  return stanzas;
}

/**
 * Maps parsed APKINDEX stanzas to cache rows, stamping which repo they
 * came from. Pure — no I/O.
 */
export function mapStanzas(
  stanzas: Record<string, string>[],
  repo: AlpineCacheEntry["repo"],
): AlpineCacheEntry[] {
  return stanzas
    .filter((fields): fields is typeof fields & { P: string } => Boolean(fields.P))
    .map((fields) => ({
      name: fields.P,
      description: fields.T ?? "",
      version: fields.V ?? "unknown",
      homepage: fields.U || undefined,
      repo,
    }));
}

/**
 * Downloads one repo's APKINDEX.tar.gz, extracts it (a flat `APKINDEX`
 * text file alongside a signature and a `DESCRIPTION` file — unlike
 * Arch's per-package-directory `.db` archives, there's nothing to walk),
 * and parses it into cache rows.
 */
async function fetchRepoEntries(repo: (typeof REPOS)[number]): Promise<AlpineCacheEntry[]> {
  const url = `${BASE}/${repo}/${ARCH}/APKINDEX.tar.gz`;
  const response = await fetchOrThrow(url, `Alpine repo "${repo}"`);

  const workDir = await mkdtemp(join(tmpdir(), `alpine-${repo}-`));
  try {
    const archivePath = join(workDir, "APKINDEX.tar.gz");
    await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
    await tar.x({ file: archivePath, cwd: workDir });

    const text = await readFile(join(workDir, "APKINDEX"), "utf8");
    return mapStanzas(parseApkindex(text), repo);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Downloads Alpine's main + community APKINDEX for one arch and writes
 * the concatenated entries to `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchAlpine(cachePath: string): Promise<number> {
  const repoEntries = await Promise.all(REPOS.map(fetchRepoEntries));
  const entries = repoEntries.flat();

  writeNdjson(cachePath, entries);
  writeMetadata<AlpineFetchMetadata>(cachePath, {
    source: "apk-alpine",
    fetchedAt: new Date().toISOString(),
    url: `${BASE}/{${REPOS.join(",")}}/${ARCH}/APKINDEX.tar.gz`,
    entryCount: entries.length,
    reposFetched: [...REPOS],
  });

  return entries.length;
}
