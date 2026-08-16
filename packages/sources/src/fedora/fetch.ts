import { zstdDecompressSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { FedoraCacheEntry, FedoraFetchMetadata } from "./types";

// Fedora publishes one repodata set per release/repo/arch. This fetches
// two repos for the current release/arch: "Everything" (the frozen
// release-day snapshot) and "updates" (an overlay repo with newer package
// versions, and occasionally packages added after release day — a real
// dnf/yum install takes updates over Everything for any name in both).
// Extending to other releases/archs is a straight repeat of this same
// two-step mechanism, not a different one.
//
// mergeByName's per-name dedup means the merged entry count is *lower*
// than the raw entry count from Everything alone used to be, which looks
// like a regression at a glance but isn't: verified against the real
// data that Everything's own primary.xml has 76,354 raw `<package>`
// entries for only 67,430 unique names (arch/subpackage variants sharing
// a name) — those duplicates were always silently in the cache, one
// SourcedPackage row each, before this change. updates then adds 1,560
// genuinely new names on top (e.g. 86box, OpenBoard) — net real coverage
// goes up even though the raw row count goes down.
const RELEASE = "44";
const ARCH = "x86_64";
const REPO_BASES = [
  `https://dl.fedoraproject.org/pub/fedora/linux/releases/${RELEASE}/Everything/${ARCH}/os`,
  `https://dl.fedoraproject.org/pub/fedora/linux/updates/${RELEASE}/Everything/${ARCH}`,
] as const;

interface RawPackage {
  name?: string;
  summary?: string;
  version?: { "@_ver"?: string };
  url?: string;
}

/**
 * Finds the current primary metadata's location from `repomd.xml`. RPM
 * repos publish that file with a content-hash prefix that changes on
 * every metadata refresh (e.g. `<hash>-primary.xml.zst`), unlike Debian's
 * fixed `Packages.gz` path — it can't be hardcoded, has to be looked up.
 * Matches `type="primary"` specifically, not `"primary_db"`/`"primary_zck"`
 * (repomd.xml lists several encodings of the same data). Pure — no I/O —
 * so it's covered by tests, same as `parsePrimary`.
 */
export function extractPrimaryLocation(repomdXml: string): string | undefined {
  return repomdXml.match(/<data type="primary">[\s\S]*?<location href="([^"]+)"/)?.[1];
}

/**
 * Parses Fedora's primary.xml (already decompressed) into cache rows.
 * Pure — no I/O.
 */
export function parsePrimary(xml: string): FedoraCacheEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    isArray: (name) => name === "package",
    // Without this, fast-xml-parser silently turns purely-numeric text
    // into a JS number — real bug hit on the actual data: a package
    // literally named "65535" came back as the number 65535, not the
    // string "65535". Every field here is meant to stay a string.
    parseTagValue: false,
    parseAttributeValue: false,
  });

  const parsed = parser.parse(xml) as { metadata?: { package?: RawPackage[] } };
  const packages = parsed.metadata?.package ?? [];

  return packages
    .filter((pkg) => pkg.name)
    .map((pkg) => ({
      name: pkg.name ?? "",
      summary: pkg.summary ?? "",
      version: pkg.version?.["@_ver"] ?? "unknown",
      homepage: pkg.url || undefined,
    }));
}

/**
 * Downloads one repo's repodata — repomd.xml first to find the current
 * content-hashed primary metadata path, then that file itself
 * (Zstandard-compressed; Node's built-in zlib decodes it without a new
 * dependency) — and parses it into cache rows.
 */
async function fetchRepo(repoBase: string): Promise<FedoraCacheEntry[]> {
  const repomdResponse = await fetch(`${repoBase}/repodata/repomd.xml`);
  if (!repomdResponse.ok) {
    throw new Error(
      `Failed to fetch Fedora repomd.xml at ${repoBase}: ${repomdResponse.status} ${repomdResponse.statusText}`,
    );
  }

  const repomdXml = await repomdResponse.text();
  const primaryLocation = extractPrimaryLocation(repomdXml);
  if (!primaryLocation) {
    throw new Error(`Fedora repomd.xml at ${repoBase} has no primary data location`);
  }

  const primaryUrl = `${repoBase}/${primaryLocation}`;
  const primaryResponse = await fetch(primaryUrl);
  if (!primaryResponse.ok) {
    throw new Error(
      `Failed to fetch Fedora primary metadata at ${primaryUrl}: ${primaryResponse.status} ${primaryResponse.statusText}`,
    );
  }

  const compressed = Buffer.from(await primaryResponse.arrayBuffer());
  const xml = zstdDecompressSync(compressed).toString("utf8");
  return parsePrimary(xml);
}

/**
 * Merges Everything + updates by name, later repos in `repoEntries`
 * winning ties — matches real dnf/yum behavior, where the updates repo
 * always takes precedence over the release-day snapshot for the same
 * package name. Pure — no I/O.
 */
export function mergeByName(repoEntries: FedoraCacheEntry[][]): FedoraCacheEntry[] {
  const byName = new Map<string, FedoraCacheEntry>();
  for (const entries of repoEntries) {
    for (const entry of entries) byName.set(entry.name, entry);
  }
  return [...byName.values()];
}

/**
 * Downloads Fedora's Everything + updates repodata for one release/arch
 * and writes the merged, deduplicated entries to `cachePath` as NDJSON.
 * See docs/sources.md.
 */
export async function fetchFedora(cachePath: string): Promise<number> {
  const repoEntries = await Promise.all(REPO_BASES.map(fetchRepo));
  const entries = mergeByName(repoEntries);

  writeNdjson(cachePath, entries);
  writeMetadata<FedoraFetchMetadata>(cachePath, {
    source: "fedora",
    fetchedAt: new Date().toISOString(),
    url: REPO_BASES.join(", "),
    entryCount: entries.length,
    release: RELEASE,
    arch: ARCH,
  });

  return entries.length;
}
