import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { NixpkgsCacheEntry, NixpkgsFetchMetadata } from "./types";

// nixpkgs publishes one giant per-channel dump, updated continuously —
// the closest thing to a full-catalog file this codebase has seen
// (149,121 entries as of writing, more than AUR). The .br extension is
// misleading: the server sends it with a real `Content-Encoding: br`
// header, and Node's built-in fetch (like a browser) transparently
// decompresses that itself — response.text() already returns plain
// JSON, no manual zlib.brotliDecompressSync() step needed (confirmed by
// hitting a decompression error until this was found — the naive
// "download bytes, decompress them" approach every other connector uses
// doesn't apply here specifically because of that header, not because
// of anything nixpkgs-specific).
const PACKAGES_URL = "https://channels.nixos.org/nixos-unstable/packages.json.br";
// Only arch this repo tracks anywhere else — the dump is 149,071
// x86_64-linux entries plus 50 i686-linux (32-bit), verified against the
// real file.
const SYSTEM = "x86_64-linux";

interface RawPackage {
  pname?: string;
  version?: string;
  system?: string;
  meta?: {
    description?: string;
    homepage?: string | string[];
    broken?: boolean;
    available?: boolean;
  };
}

interface RawDump {
  packages?: Record<string, RawPackage>;
}

/**
 * Splits an attribute path into its namespace prefix (before the first
 * `.`) and the rest — `kdePackages.akregator` -> `kdePackages`. Returns
 * `undefined` for a top-level attribute with no prefix. Pure — no I/O.
 */
export function extractPrefix(attrPath: string): string | undefined {
  const dotIndex = attrPath.indexOf(".");
  return dotIndex === -1 ? undefined : attrPath.slice(0, dotIndex);
}

/**
 * Maps the raw `packages` object (keyed by attribute path) to cache
 * rows — dropping non-`x86_64-linux` entries and ones nixpkgs itself
 * marks `broken` or `available: false` (a technical fact, not a
 * curation judgment: these genuinely cannot be installed today). Pure —
 * no I/O — so it's the part covered by tests.
 */
export function mapPackages(packages: Record<string, RawPackage>): NixpkgsCacheEntry[] {
  const entries: NixpkgsCacheEntry[] = [];

  for (const [attrPath, pkg] of Object.entries(packages)) {
    if (!pkg.pname || pkg.system !== SYSTEM) continue;
    if (pkg.meta?.broken || pkg.meta?.available === false) continue;

    const homepage = pkg.meta?.homepage;
    entries.push({
      attrPath,
      name: pkg.pname,
      description: pkg.meta?.description ?? "",
      version: pkg.version ?? "unknown",
      homepage: Array.isArray(homepage) ? homepage[0] : homepage,
      prefix: extractPrefix(attrPath),
    });
  }

  return entries;
}

/**
 * Downloads nixpkgs' channel dump and writes the normalized entries to
 * `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchNixpkgs(cachePath: string): Promise<number> {
  const response = await fetch(PACKAGES_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch nixpkgs dump: ${response.status} ${response.statusText}`);
  }

  const json = await response.text();
  const dump = JSON.parse(json) as RawDump;
  const entries = mapPackages(dump.packages ?? {});

  writeNdjson(cachePath, entries);
  writeMetadata<NixpkgsFetchMetadata>(cachePath, {
    source: "nix-nixpkgs",
    fetchedAt: new Date().toISOString(),
    url: PACKAGES_URL,
    entryCount: entries.length,
  });

  return entries.length;
}
