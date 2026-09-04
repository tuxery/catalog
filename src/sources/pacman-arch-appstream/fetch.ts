import { gunzipSync, zstdDecompressSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as tar from "tar";
import { parseAppstreamXml, type AppstreamComponent } from "../_shared/appstream";
import { fetchOrThrow } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import { withTempDir } from "../_shared/tempdir";
import type { PacmanArchAppstreamCacheEntry, PacmanArchAppstreamFetchMetadata } from "./types";

// Same mirror + arch as pacman-arch — the AppStream component's `pkgname` is
// a binary package name from the same repos the pacman-arch connector
// indexes, and the exact-appId match tier needs both sides describing the
// same package set.
const MIRROR_BASE = "https://geo.mirror.pkgbuild.com";
const ARCH = "x86_64";
// The `archlinux-appstream-data` package is arch "any" but lives in the
// x86_64 tree like every other Arch package.
const PACKAGE_NAME = "archlinux-appstream-data";
// The package ships one AppStream XML per repo (core/extra/multilib) — all
// three are parsed and merged.
const REPO_XML_FILES = ["core.xml.gz", "extra.xml.gz", "multilib.xml.gz"] as const;

interface ArchApiPackage {
  filename?: string;
}

/** Extracts the package filename from Arch's packages search API response. Pure — no I/O. */
export function resolveAppstreamDataFilename(apiJson: unknown): string | undefined {
  const results = (apiJson as { results?: ArchApiPackage[] })?.results;
  return results?.[0]?.filename;
}

/**
 * Turns a generic AppStream component into the Arch-specific cache row
 * shape. Keeps only components with a binary package name (`pkgname`),
 * because that's the join key to the pacman-arch source.
 */
export function toCacheEntries(components: AppstreamComponent[]): PacmanArchAppstreamCacheEntry[] {
  return components
    .filter((component) => component.pkgname)
    .map((component) => ({
      id: component.id,
      pkgname: component.pkgname as string,
      source_pkgname: component.source_pkgname,
      name: component.name,
      summary: component.summary,
      version: component.version,
      iconFilename: component.iconFilename,
      remoteIconUrl: component.remoteIconUrl,
      homepage: component.homepage,
      hasGameCategory: component.hasGameCategory,
      categories: component.categories,
      license: component.license,
      developer: component.developer,
      longDescription: component.longDescription,
      screenshots: component.screenshots,
      languages: component.languages,
      changelog: component.changelog,
      lastUpdated: component.lastUpdated,
    }));
}

/**
 * Resolves the current `archlinux-appstream-data` package filename from
 * Arch's own packages API (the filename is date-stamped, so it can't be
 * hardcoded), then downloads it from the mirror and returns the
 * decompressed `.pkg.tar.zst` as a tar buffer.
 */
async function fetchAppstreamTar(): Promise<{ buffer: Buffer; filename: string }> {
  const apiResponse = await fetchOrThrow(
    `https://archlinux.org/packages/search/json/?name=${PACKAGE_NAME}`,
    "Arch appstream-data package lookup",
  );
  const filename = resolveAppstreamDataFilename((await apiResponse.json()) as unknown);
  if (!filename) {
    throw new Error("Arch packages API returned no archlinux-appstream-data package");
  }

  const url = `${MIRROR_BASE}/extra/os/${ARCH}/${filename}`;
  const response = await fetchOrThrow(url, "Arch appstream-data package");
  const compressed = Buffer.from(await response.arrayBuffer());
  return { buffer: zstdDecompressSync(compressed), filename };
}

/**
 * Downloads Arch's `archlinux-appstream-data` package, extracts its three
 * per-repo `*.xml.gz` files (zstd-compressed tar -> gzipped AppStream XML),
 * and returns the merged, parsed components.
 */
async function fetchArchComponents(): Promise<{
  entries: PacmanArchAppstreamCacheEntry[];
  filename: string;
}> {
  const { buffer, filename } = await fetchAppstreamTar();

  const entries = await withTempDir("arch-appstream-fetch", async (workDir) => {
    // tar.x needs a file path, not an in-memory buffer — write the
    // decompressed tar out once, then extract only the three XML files.
    const tarPath = join(workDir, "appstream.tar");
    await writeFile(tarPath, buffer);
    await tar.x({
      file: tarPath,
      cwd: workDir,
      filter: (path) => REPO_XML_FILES.some((name) => path.endsWith(`/${name}`)),
    });

    const components = (
      await Promise.all(
        REPO_XML_FILES.map((file) =>
          readFile(join(workDir, "usr", "share", "swcatalog", "xml", file)).catch(() => undefined),
        ),
      )
    )
      .filter((gz): gz is Buffer => gz !== undefined)
      .flatMap((gz) => parseAppstreamXml(gunzipSync(gz).toString("utf8")));
    return toCacheEntries(components);
  });

  return { entries, filename };
}

/**
 * Downloads Arch's AppStream metadata and writes the parsed components to
 * `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchArchAppstream(cachePath: string): Promise<number> {
  const { entries, filename } = await fetchArchComponents();

  writeNdjson(cachePath, entries);
  writeMetadata<PacmanArchAppstreamFetchMetadata>(cachePath, {
    source: "pacman-arch-appstream",
    fetchedAt: new Date().toISOString(),
    url: `${MIRROR_BASE}/extra/os/${ARCH}/${filename}`,
    entryCount: entries.length,
    packageFilename: filename,
  });

  return entries.length;
}
