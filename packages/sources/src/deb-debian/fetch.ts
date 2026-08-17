import { parseDeb822 } from "../_shared/deb822";
import { fetchGunzippedText } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { DebianCacheEntry, DebianFetchMetadata } from "./types";

// Debian publishes one Packages file per suite/component/arch — this
// fetches stable/{main,contrib,non-free,non-free-firmware}/amd64. main is
// enabled out of the box; the other three (all license-restricted in some
// way — non-DFSG-free software, or software that depends on non-free
// software, or non-free firmware blobs split out of non-free in 2023)
// need enabling first, same organizing principle as Ubuntu's
// main/universe/restricted/multiverse. Extending to other suites/archs is
// a straight repeat of this same shape, not a different mechanism.
const SUITE = "stable";
const COMPONENTS = ["main", "contrib", "non-free", "non-free-firmware"] as const;
type DebianComponent = (typeof COMPONENTS)[number];
const ARCH = "amd64";

function packagesUrl(component: DebianComponent): string {
  // .gz, not the .xz the archive defaults to — Node's built-in zlib can
  // gunzip without an extra dependency; deb.debian.org still publishes both.
  return `https://deb.debian.org/debian/dists/${SUITE}/${component}/binary-${ARCH}/Packages.gz`;
}

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
      section: fields.Section || undefined,
    }));
}

async function fetchComponent(component: DebianComponent): Promise<DebianCacheEntry[]> {
  const text = await fetchGunzippedText(packagesUrl(component), `Debian component "${component}"`);
  return parsePackages(text, component);
}

/**
 * Downloads Debian's Packages.gz for main + contrib + non-free +
 * non-free-firmware — the same repodata `apt` itself reads — and writes
 * the normalized entries to `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchDebian(cachePath: string): Promise<number> {
  const entriesByComponent = await Promise.all(COMPONENTS.map(fetchComponent));
  const entries = entriesByComponent.flat();

  writeNdjson(cachePath, entries);
  writeMetadata<DebianFetchMetadata>(cachePath, {
    source: "deb-debian",
    fetchedAt: new Date().toISOString(),
    url: COMPONENTS.map(packagesUrl).join(", "),
    entryCount: entries.length,
    suite: SUITE,
    component: COMPONENTS.join("+"),
    arch: ARCH,
  });

  return entries.length;
}
