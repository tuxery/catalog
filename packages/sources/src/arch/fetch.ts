import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tar from "tar";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { ArchCacheEntry, ArchFetchMetadata } from "./types";

// Arch's official, pre-built package set is "core" + "extra" together —
// a different thing from AUR (packages/sources/aur/), which is a
// separate community repo of build recipes, not pre-built binaries.
// multilib (32-bit compat libs) is skipped, same spirit as Debian's
// contrib/non-free not being fetched.
const ARCH = "x86_64";
const REPOS = ["core", "extra"] as const;
type ArchRepo = (typeof REPOS)[number];
const MIRROR_BASE = "https://geo.mirror.pkgbuild.com";

/**
 * Parses one package's `desc` file — Arch's own format, `%FIELD%` on its
 * own line followed by the value, blocks separated by a blank line (some
 * fields like `%DEPENDS%` have multi-line values; only the first value
 * line is kept, which is all `NAME`/`VERSION`/`DESC`/`URL` ever use).
 * Pure — no I/O.
 */
export function parseDesc(content: string): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const block of content.split(/\n\n+/)) {
    const lines = block.split("\n").filter((line) => line.length > 0);
    const fieldLine = lines[0];
    if (!fieldLine || !fieldLine.startsWith("%") || !fieldLine.endsWith("%")) continue;

    const value = lines[1];
    if (value !== undefined) fields[fieldLine.slice(1, -1)] = value;
  }

  return fields;
}

/**
 * Maps parsed `desc` field maps to cache rows, stamping which repo they
 * came from (a package belongs to exactly one of core/extra, never both).
 * Pure — no I/O — so it's covered by tests, along with `parseDesc`.
 */
export function mapDescFiles(
  descFields: Record<string, string>[],
  repo: ArchRepo,
): ArchCacheEntry[] {
  return descFields
    .filter((fields): fields is typeof fields & { NAME: string } => Boolean(fields.NAME))
    .map((fields) => ({
      name: fields.NAME,
      description: fields.DESC ?? "",
      version: fields.VERSION ?? "unknown",
      homepage: fields.URL || undefined,
      repo,
    }));
}

async function fetchRepoEntries(repo: ArchRepo, workDir: string): Promise<ArchCacheEntry[]> {
  const url = `${MIRROR_BASE}/${repo}/os/${ARCH}/${repo}.db`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Arch repo "${repo}": ${response.status} ${response.statusText}`,
    );
  }

  const repoDir = join(workDir, repo);
  await mkdir(repoDir, { recursive: true });
  const archivePath = join(workDir, `${repo}.db.tar.gz`);
  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
  // core.db/extra.db are plain gzipped tars (despite the ".db" name) —
  // tar auto-detects the gzip compression, no separate gunzip step needed.
  await tar.x({ file: archivePath, cwd: repoDir });

  const dirEntries = await readdir(repoDir, { withFileTypes: true });
  const contents = await Promise.all(
    dirEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readFile(join(repoDir, entry.name, "desc"), "utf8").catch(() => undefined)),
  );
  const descFields = contents
    .filter((content): content is string => content !== undefined)
    .map(parseDesc);

  return mapDescFiles(descFields, repo);
}

/**
 * Downloads Arch's official "core" and "extra" repo databases, extracts
 * each package's `desc` file, and writes the normalized entries to
 * `cachePath` as NDJSON — each row keeps its source repo (see
 * `ArchCacheEntry.repo`), no cross-repo dedup needed since a package name
 * only ever belongs to one. See docs/sources.md.
 */
export async function fetchArch(cachePath: string): Promise<number> {
  const workDir = await mkdtemp(join(tmpdir(), "arch-fetch-"));

  try {
    const entriesByRepo = await Promise.all(REPOS.map((repo) => fetchRepoEntries(repo, workDir)));
    const entries = entriesByRepo.flat();

    writeNdjson(cachePath, entries);
    writeMetadata<ArchFetchMetadata>(cachePath, {
      source: "arch",
      fetchedAt: new Date().toISOString(),
      url: `${MIRROR_BASE}/{${REPOS.join(",")}}/os/${ARCH}/*.db`,
      entryCount: entries.length,
      repos: [...REPOS],
      arch: ARCH,
    });

    return entries.length;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
