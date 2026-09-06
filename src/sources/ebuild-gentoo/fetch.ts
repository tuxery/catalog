import { createWriteStream } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { groupBy } from "helpers4/object";
import { compare } from "helpers4/version";
import * as tar from "tar";
// xz-decompress ships a Webpack UMD bundle (a single `module.exports =
// factory(...)` assignment) — Node's CJS/ESM interop can't statically
// detect `XzReadableStream` as a named export from that shape, so it's
// pulled off the default (whole `module.exports`) import instead.
import xzDecompress from "xz-decompress";
import { fetchOrThrow } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import { withTempDir } from "../_shared/tempdir";
import type { GentooCacheEntry, GentooFetchMetadata } from "./types";

// Gentoo is source-based (ebuilds compiled locally via `emerge`,
// conceptually closer to AUR's build-recipe model than a binary repo)
// rather than a binary repo -- its own official binary package host
// (distfiles.gentoo.org's Packages index) has no DESCRIPTION/HOMEPAGE
// field at all. Real per-package metadata only lives in the Portage
// tree's md5-cache: pre-computed ebuild variables (one file per
// category/package-version), bundled in a periodic full-tree snapshot.
// The one native source needing an actual XZ-decompression dependency --
// Node's built-in zlib has gzip/brotli/zstd but no XZ/LZMA support.
// xz-decompress is WASM-based (no native compilation), matching this
// codebase's existing preference for portable pure-JS/WASM deps over
// native bindings. Extraction is filtered to metadata/md5-cache/ only --
// the snapshot also contains every ebuild, eclass, and profile, none of
// which this connector needs.
const URL = "https://distfiles.gentoo.org/snapshots/portage-latest.tar.xz";
const MD5_CACHE_PREFIX = "portage/metadata/md5-cache/";

/**
 * Parses one md5-cache file's `KEY=value` lines (shell-variable-style,
 * one var per line — unlike deb822/APKINDEX, no prefix character, and
 * unlike Arch's `desc` format, no continuation lines to worry about).
 * Pure — no I/O.
 */
export function parseEbuildCache(content: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;
    fields[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
  }
  return fields;
}

// A category/package-version filename, e.g. `0ad-0.28.0-r1`. The package
// name is whatever precedes the rightmost match, since package names can
// themselves contain digits/hyphens (e.g. `7zip`) — this can't just
// split on the first or last hyphen the way Slackware's simpler
// `-arch-build.txz` suffix can.
const CPV_PATTERN = /^(.+)-(\d+(?:\.\d+)*[a-z]?(?:_(?:alpha|beta|pre|rc|p)\d*)*(?:-r\d+)?)$/;

/** Splits a md5-cache filename into package name and version. Pure — no I/O. */
export function parseCpvFilename(fileName: string): { name: string; version: string } | undefined {
  const match = fileName.match(CPV_PATTERN);
  if (!match) return undefined;
  const [, name, version] = match;
  return name !== undefined && version !== undefined ? { name, version } : undefined;
}

// Live ebuilds (upstream VCS HEAD, not a pinned release) — Portage
// deliberately treats "9999" as the highest possible version so
// `emerge` always offers it when explicitly targeted, which would
// otherwise make it win `pickLatestVersion` for every package that has
// one. Excluded from consideration unless it's the package's only
// version, since a constantly-changing non-release isn't a useful
// display version.
function isLiveVersion(version: string): boolean {
  return /^9999(-r\d+)?$/.test(version);
}

/**
 * Picks the best entry to represent a package from all its cached
 * versions — the highest by Gentoo/Portage version ordering, preferring
 * any real pinned release over a live ("9999") ebuild when both exist.
 * Pure — no I/O.
 */
export function pickLatestVersion<T extends { version: string }>(entries: T[]): T {
  const pinnedReleases = entries.filter((entry) => !isLiveVersion(entry.version));
  const candidates = pinnedReleases.length > 0 ? pinnedReleases : entries;
  return candidates.reduce((best, entry) =>
    compare(entry.version, best.version, "gentoo") > 0 ? entry : best,
  );
}

/**
 * Reduces every raw category/package/version md5-cache entry down to one
 * row per category/package, keeping only the version `pickLatestVersion`
 * picks. Pure — no I/O.
 */
export function pickLatestPerPackage(entries: GentooCacheEntry[]): GentooCacheEntry[] {
  const byKey = groupBy(entries, (entry) => `${entry.category}/${entry.name}`);
  return Object.values(byKey)
    .filter((group): group is GentooCacheEntry[] => group !== undefined)
    .map((group) => pickLatestVersion(group));
}

/**
 * Downloads the Portage snapshot, decompresses it (streamed straight to
 * disk — 352MB uncompressed, too large to hold as one in-memory buffer
 * the way smaller archives elsewhere in this codebase do), and extracts
 * only the md5-cache tree into `workDir`.
 */
async function fetchAndExtractMd5Cache(workDir: string): Promise<string> {
  const response = await fetchOrThrow(URL, "Gentoo Portage snapshot");
  if (!response.body) {
    throw new Error("Failed to fetch Gentoo Portage snapshot: response had no body");
  }

  const tarPath = join(workDir, "portage.tar");
  const { XzReadableStream } = xzDecompress;
  await pipeline(Readable.fromWeb(new XzReadableStream(response.body)), createWriteStream(tarPath));

  await tar.x({ file: tarPath, cwd: workDir, filter: (path) => path.startsWith(MD5_CACHE_PREFIX) });

  return join(workDir, MD5_CACHE_PREFIX);
}

interface CacheFileLocation {
  category: string;
  filePath: string;
  fileName: string;
}

/**
 * Walks the extracted md5-cache tree (one directory per category, one
 * file per package-version) and parses every entry — full-concurrency
 * `Promise.all`, same pattern Arch's connector uses for its own set of
 * small per-package files: Node's fs promises queue through libuv's
 * threadpool, so this doesn't actually hold thousands of file
 * descriptors open at once despite every promise starting together.
 */
async function readAllEntries(md5CacheDir: string): Promise<GentooCacheEntry[]> {
  const categories = await readdir(md5CacheDir, { withFileTypes: true });
  const categoryNames = categories
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const locationsByCategory = await Promise.all(
    categoryNames.map(async (category): Promise<CacheFileLocation[]> => {
      const categoryDir = join(md5CacheDir, category);
      const fileNames = (await readdir(categoryDir)).filter(
        (fileName) => !fileName.startsWith("Manifest"),
      );
      return fileNames.map((fileName) => ({
        category,
        filePath: join(categoryDir, fileName),
        fileName,
      }));
    }),
  );

  const entries = await Promise.all(
    locationsByCategory.flat().map(async (location): Promise<GentooCacheEntry | undefined> => {
      const parsed = parseCpvFilename(location.fileName);
      if (!parsed) return undefined;

      const content = await readFile(location.filePath, "utf8");
      const fields = parseEbuildCache(content);

      return {
        category: location.category,
        name: parsed.name,
        version: parsed.version,
        description: fields.DESCRIPTION ?? "",
        homepage: fields.HOMEPAGE || undefined,
      };
    }),
  );

  return entries.filter((entry): entry is GentooCacheEntry => entry !== undefined);
}

/**
 * Downloads Gentoo's Portage snapshot, reduces it to one row per
 * category/package (latest version), and writes the entries to
 * `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchGentoo(cachePath: string): Promise<number> {
  const entries = await withTempDir("gentoo-fetch", async (workDir) => {
    const md5CacheDir = await fetchAndExtractMd5Cache(workDir);
    const rawEntries = await readAllEntries(md5CacheDir);
    return pickLatestPerPackage(rawEntries);
  });

  writeNdjson(cachePath, entries);
  writeMetadata<GentooFetchMetadata>(cachePath, {
    source: "ebuild-gentoo",
    fetchedAt: new Date().toISOString(),
    url: URL,
    entryCount: entries.length,
  });

  return entries.length;
}
