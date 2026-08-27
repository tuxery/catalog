import { parseDeb822 } from "../_shared/deb822";
import { fetchGunzippedText } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { DeepinCacheEntry, DeepinFetchMetadata } from "./types";

// Deepin publishes deb822 Packages files (same format as Debian/Ubuntu,
// parsed with the same _shared/deb822.ts) under one "main" component,
// but unlike every other deb822 source here it isn't scoped to current
// versions only — Deepin keeps every historical version in the same
// Packages.gz (e.g. multiple stanzas for dde-calendar alone) rather than
// just the latest. Stanzas for the same package are always listed
// newest-first, so the first stanza per name is kept and the rest
// dropped — same "releases are newest-first" assumption Flathub's
// connector already relies on.
//
// Also unlike Mint (whose "main" component is a small, already-scoped
// bucket of Mint's own software), Deepin's "main" is the whole distro
// archive — scoped down to genuinely Deepin-authored packages by name
// prefix (dde-/deepin-) instead, same approach as Pop!_OS. Real apps
// (dde-calendar, dde-file-manager, deepin-album, deepin-calculator, ...)
// come mixed with libraries/daemons/dev files, filtered the same way as
// every other Debian-derivative source (name patterns + Debian's own
// Section vocabulary, which Deepin reuses verbatim).
const RELEASE = "apricot";
const COMPONENT = "main";
const ARCH = "amd64";
const PACKAGES_URL = `https://community-packages.deepin.com/deepin/dists/${RELEASE}/${COMPONENT}/binary-${ARCH}/Packages.gz`;

const DEEPIN_PREFIX_PATTERN = /^(dde|deepin)/;

/** Whether a package name looks like genuinely Deepin-authored software. Pure — no I/O. */
export function isDeepinPackage(name: string): boolean {
  return DEEPIN_PREFIX_PATTERN.test(name);
}

/**
 * Keeps only the first (newest, per the file's real ordering) stanza per
 * package name. Pure — no I/O.
 */
export function dedupeByNewest<T extends { name: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const entry of entries) {
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);
    result.push(entry);
  }
  return result;
}

/**
 * Maps deb822 stanzas (already parsed by `_shared/deb822.ts`) to cache
 * rows, keeping only Deepin-authored packages and deduplicating to the
 * newest version per name. Pure — no I/O — so it's the part covered by
 * tests.
 */
export function parsePackages(text: string): DeepinCacheEntry[] {
  const entries = parseDeb822(text)
    .filter((fields): fields is typeof fields & { Package: string } => Boolean(fields.Package))
    .filter((fields) => isDeepinPackage(fields.Package))
    .map((fields) => ({
      name: fields.Package,
      description: fields.Description ?? "",
      version: fields.Version ?? "unknown",
      homepage: fields.Homepage || undefined,
      section: fields.Section || undefined,
    }));

  return dedupeByNewest(entries);
}

/**
 * Downloads Deepin's `main` component Packages.gz and writes the
 * normalized entries to `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchDeepin(cachePath: string): Promise<number> {
  const text = await fetchGunzippedText(PACKAGES_URL, "Deepin Packages");
  const entries = parsePackages(text);

  writeNdjson(cachePath, entries);
  writeMetadata<DeepinFetchMetadata>(cachePath, {
    source: "deb-deepin",
    fetchedAt: new Date().toISOString(),
    url: PACKAGES_URL,
    entryCount: entries.length,
    release: RELEASE,
    component: COMPONENT,
    arch: ARCH,
  });

  return entries.length;
}
