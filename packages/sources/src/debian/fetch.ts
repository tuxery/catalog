import { gunzipSync } from "node:zlib";
import { parseDeb822 } from "../_shared/deb822";
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
 * Maps deb822 stanzas (already parsed by `_shared/deb822.ts`) to cache
 * rows. Pure — no I/O — so it's the part covered by tests.
 */
export function parsePackages(text: string, component: string): DebianCacheEntry[] {
  return parseDeb822(text)
    .filter((fields): fields is typeof fields & { Package: string } => Boolean(fields.Package))
    .map((fields) => ({
      name: fields.Package,
      description: fields.Description ?? "",
      version: fields.Version ?? "unknown",
      homepage: fields.Homepage || undefined,
      component,
    }));
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
  const entries = parsePackages(text, COMPONENT);

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
