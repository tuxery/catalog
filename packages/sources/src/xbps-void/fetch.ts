import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zstdDecompressSync } from "node:zlib";
import { parse as parsePlist } from "plist";
import * as tar from "tar";
import { fetchOrThrow } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { VoidCacheEntry, VoidFetchMetadata } from "./types";

// Void publishes repodata as a Zstandard-compressed tar (despite no file
// extension hinting at either) containing index.plist -- an XML property
// list (Apple/GNUstep plist format), one dict per package keyed by
// pkgname -- parsed with the `plist` npm package rather than hand-rolling
// a plist walker. Three repos: "main" (the default repo), "nonfree"
// (proprietary/restricted, same split as Debian's non-free), and
// "multilib" (32-bit compat packages, `-32bit`-suffixed names) --
// disjoint, so a plain concatenation is enough.
const ARCH = "x86_64";
const REPOS = [
  { id: "main", base: "https://repo-default.voidlinux.org/current" },
  { id: "nonfree", base: "https://repo-default.voidlinux.org/current/nonfree" },
  { id: "multilib", base: "https://repo-default.voidlinux.org/current/multilib" },
] as const;

type PlistPackages = Record<string, Record<string, unknown>>;

/**
 * Maps a parsed index.plist (pkgname -> package dict) to cache rows.
 * Pure — no I/O.
 */
export function mapPlist(packages: PlistPackages, repo: VoidCacheEntry["repo"]): VoidCacheEntry[] {
  return Object.entries(packages).map(([name, fields]) => ({
    name,
    short_desc: typeof fields.short_desc === "string" ? fields.short_desc : "",
    pkgver: typeof fields.pkgver === "string" ? fields.pkgver : name,
    homepage: typeof fields.homepage === "string" ? fields.homepage : undefined,
    repo,
  }));
}

/**
 * Downloads one repo's repodata — Zstandard-compressed, then a plain tar
 * containing `index.plist` alongside `index-meta.plist`/`stage.plist`
 * (only `index.plist` has per-package data) — and parses it into cache
 * rows.
 */
async function fetchRepoEntries(repo: (typeof REPOS)[number]): Promise<VoidCacheEntry[]> {
  const url = `${repo.base}/${ARCH}-repodata`;
  const response = await fetchOrThrow(url, `Void repo "${repo.id}"`);

  const compressed = Buffer.from(await response.arrayBuffer());
  const tarBytes = zstdDecompressSync(compressed);

  const workDir = await mkdtemp(join(tmpdir(), `void-${repo.id}-`));
  try {
    const archivePath = join(workDir, "repodata.tar");
    await writeFile(archivePath, tarBytes);
    await tar.x({ file: archivePath, cwd: workDir });

    const plistXml = await readFile(join(workDir, "index.plist"), "utf8");
    const packages = parsePlist(plistXml) as unknown as PlistPackages;
    return mapPlist(packages, repo.id);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Downloads Void's main + nonfree + multilib repodata for one arch and
 * writes the concatenated entries to `cachePath` as NDJSON. See
 * docs/sources.md.
 */
export async function fetchVoid(cachePath: string): Promise<number> {
  const repoEntries = await Promise.all(REPOS.map(fetchRepoEntries));
  const entries = repoEntries.flat();

  writeNdjson(cachePath, entries);
  writeMetadata<VoidFetchMetadata>(cachePath, {
    source: "xbps-void",
    fetchedAt: new Date().toISOString(),
    url: REPOS.map((repo) => `${repo.base}/${ARCH}-repodata`).join(", "),
    entryCount: entries.length,
    reposFetched: REPOS.map((repo) => repo.id),
  });

  return entries.length;
}
