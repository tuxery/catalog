import { zstdDecompressSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { FedoraCacheEntry, FedoraFetchMetadata } from "./types";

// Fedora publishes one repodata set per release/repo/arch — this fetches
// just one combination for now (the current release's "Everything" repo,
// x86_64). Extending to other releases/repos/archs is a straight repeat
// of this same two-step mechanism, not a different one.
const RELEASE = "44";
const ARCH = "x86_64";
const REPO_BASE = `https://dl.fedoraproject.org/pub/fedora/linux/releases/${RELEASE}/Everything/${ARCH}/os`;
const REPOMD_URL = `${REPO_BASE}/repodata/repomd.xml`;

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
 * Downloads Fedora's repodata for one release/repo/arch — repomd.xml
 * first to find the current content-hashed primary metadata path, then
 * that file itself (Zstandard-compressed; Node's built-in zlib decodes it
 * without a new dependency) — and writes the normalized entries to
 * `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchFedora(cachePath: string): Promise<number> {
  const repomdResponse = await fetch(REPOMD_URL);
  if (!repomdResponse.ok) {
    throw new Error(
      `Failed to fetch Fedora repomd.xml: ${repomdResponse.status} ${repomdResponse.statusText}`,
    );
  }

  const repomdXml = await repomdResponse.text();
  const primaryLocation = extractPrimaryLocation(repomdXml);
  if (!primaryLocation) {
    throw new Error("Fedora repomd.xml has no primary data location");
  }

  const primaryUrl = `${REPO_BASE}/${primaryLocation}`;
  const primaryResponse = await fetch(primaryUrl);
  if (!primaryResponse.ok) {
    throw new Error(
      `Failed to fetch Fedora primary metadata: ${primaryResponse.status} ${primaryResponse.statusText}`,
    );
  }

  const compressed = Buffer.from(await primaryResponse.arrayBuffer());
  const xml = zstdDecompressSync(compressed).toString("utf8");
  const entries = parsePrimary(xml);

  writeNdjson(cachePath, entries);
  writeMetadata<FedoraFetchMetadata>(cachePath, {
    source: "fedora",
    fetchedAt: new Date().toISOString(),
    url: primaryUrl,
    entryCount: entries.length,
    release: RELEASE,
    arch: ARCH,
  });

  return entries.length;
}
