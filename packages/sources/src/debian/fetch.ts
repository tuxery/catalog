import { gunzipSync } from "node:zlib";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { DebianCacheEntry, DebianFetchMetadata } from "./types";

// Debian publishes one Packages file per suite/component/arch — this
// fetches just one combination for now (stable/main/amd64, the most
// common). Extending to other suites/components/archs is a straight
// repeat of this same shape, not a different mechanism.
const SUITE = "stable";
const COMPONENT = "main";
const ARCH = "amd64";
// .gz, not the .xz the archive defaults to — Node's built-in zlib can
// gunzip without an extra dependency; deb.debian.org still publishes both.
const PACKAGES_URL = `https://deb.debian.org/debian/dists/${SUITE}/${COMPONENT}/binary-${ARCH}/Packages.gz`;

/**
 * Parses a deb822 Packages file (already decompressed) into cache rows.
 * Continuation lines — deb822's way of spreading one field across several
 * lines, used for the long description, multi-line `Depends`, etc. — are
 * skipped entirely; only the first line of each field is kept, which for
 * `Description` is exactly the short summary a store would want anyway.
 * Pure — no I/O — so it's the part covered by tests.
 */
export function parsePackages(text: string): DebianCacheEntry[] {
  const entries: DebianCacheEntry[] = [];

  for (const block of text.split(/\r?\n\r?\n+/)) {
    const fields: Record<string, string> = {};

    for (const line of block.split(/\r?\n/)) {
      if (line === "" || /^[ \t]/.test(line)) continue;
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) continue;
      fields[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1).trim();
    }

    if (!fields.Package) continue;

    entries.push({
      name: fields.Package,
      description: fields.Description ?? "",
      version: fields.Version ?? "unknown",
      homepage: fields.Homepage || undefined,
    });
  }

  return entries;
}

/**
 * Downloads Debian's Packages.gz for one suite/component/arch — the same
 * repodata `apt` itself reads — and writes the normalized entries to
 * `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchDebian(cachePath: string): Promise<number> {
  const response = await fetch(PACKAGES_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Debian Packages file: ${response.status} ${response.statusText}`,
    );
  }

  const compressed = Buffer.from(await response.arrayBuffer());
  const text = gunzipSync(compressed).toString("utf8");
  const entries = parsePackages(text);

  writeNdjson(cachePath, entries);
  writeMetadata<DebianFetchMetadata>(cachePath, {
    source: "debian",
    fetchedAt: new Date().toISOString(),
    url: PACKAGES_URL,
    entryCount: entries.length,
    suite: SUITE,
    component: COMPONENT,
    arch: ARCH,
  });

  return entries.length;
}
