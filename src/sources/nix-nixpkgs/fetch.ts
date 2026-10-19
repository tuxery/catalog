import { fetchText } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import { STABLE_TRACK, type NixpkgsCacheEntry, type NixpkgsFetchMetadata } from "./types";

// nixpkgs publishes one giant per-channel dump, updated continuously.
// The .br extension is misleading: the server sends it with a real
// `Content-Encoding: br` header, and Node's built-in fetch transparently
// decompresses that itself — response.text() already returns plain
// JSON, no manual zlib.brotliDecompressSync() step needed.
//
// Two channels: nixos-unstable (rolling, the default line: what much of the
// Nix community runs day to day) and the latest numbered stable one, kept as
// a track of its own (docs/product-families.md) so a NixOS user on it finds
// what they would get. NixOS releases in May and November: bump
// `STABLE_TRACK` (types.ts) and the URL together.
const CHANNELS = [
  { url: "https://channels.nixos.org/nixos-unstable/packages.json.br" },
  { url: `https://channels.nixos.org/nixos-${STABLE_TRACK}/packages.json.br`, track: STABLE_TRACK },
] as const;
// Only arch this repo tracks anywhere else — the dump also has a small
// number of i686-linux (32-bit) entries, excluded.
const SYSTEM = "x86_64-linux";

/** One `meta.license`: an attrset (`spdxId` when nixpkgs knows it), or a bare lowercase id as text. */
type RawLicense = string | { spdxId?: string; fullName?: string; shortName?: string };

interface RawPackage {
  pname?: string;
  version?: string;
  system?: string;
  meta?: {
    description?: string;
    homepage?: string | string[];
    longDescription?: string;
    license?: RawLicense | RawLicense[];
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
 * `meta.license` as one expression: each license is its `spdxId`, else
 * its `fullName`/`shortName`; a list means every one applies (AND).
 * `undefined` when there is none. Pure — no I/O.
 */
export function nixLicense(license: RawLicense | RawLicense[] | undefined): string | undefined {
  const terms = (Array.isArray(license) ? license : [license])
    .map((entry) =>
      typeof entry === "string" ? entry : (entry?.spdxId ?? entry?.fullName ?? entry?.shortName),
    )
    .map((term) => term?.trim())
    .filter((term): term is string => Boolean(term));
  return terms.length > 0 ? [...new Set(terms)].join(" AND ") : undefined;
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
      longDescription: pkg.meta?.longDescription?.trim() || undefined,
      license: nixLicense(pkg.meta?.license),
      prefix: extractPrefix(attrPath),
    });
  }

  return entries;
}

/**
 * Downloads nixpkgs' unstable and stable channel dumps and writes the
 * normalized entries to `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchNixpkgs(cachePath: string): Promise<number> {
  // One dump at a time: each is several hundred MB of JSON once decoded.
  const lists: NixpkgsCacheEntry[][] = [];
  for (const channel of CHANNELS) {
    // eslint-disable-next-line no-await-in-loop
    const json = await fetchText(channel.url, "nixpkgs dump");
    const dump = JSON.parse(json) as RawDump;
    const mapped = mapPackages(dump.packages ?? {});
    lists.push(
      "track" in channel ? mapped.map((entry) => ({ ...entry, track: channel.track })) : mapped,
    );
  }
  // `.flat()`, not `push(...list)`: spreading 130,000 entries into one call
  // overflows the stack (it broke the 2026-10-19 refresh).
  const entries = lists.flat();

  writeNdjson(cachePath, entries);
  writeMetadata<NixpkgsFetchMetadata>(cachePath, {
    source: "nix-nixpkgs",
    fetchedAt: new Date().toISOString(),
    url: CHANNELS.map((channel) => channel.url).join(", "),
    entryCount: entries.length,
  });

  return entries.length;
}
