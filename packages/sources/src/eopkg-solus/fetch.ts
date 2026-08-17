import { zstdDecompressSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { SolusCacheEntry, SolusFetchMetadata } from "./types";

// Solus publishes eopkg-index.xml in three forms at the same path
// (uncompressed, .xz, .zst) — the .zst one is used here, same "Node's
// built-in zlib decodes it, no new dependency" reasoning as Fedora/
// openSUSE, and far smaller than the uncompressed original (4.1MB vs.
// 67MB). Single repo ("shannon", Solus's rolling release), no per-arch
// split to worry about (Solus is x86_64-only).
const URL = "https://packages.getsol.us/shannon/eopkg-index.xml.zst";

interface RawLocalizedText {
  "#text"?: string;
  "@_xml:lang"?: string;
}

interface RawPackage {
  Name?: string;
  Summary?: RawLocalizedText[];
  PartOf?: string;
  History?: { Update?: { Version?: string }[] };
  Source?: { Homepage?: string };
}

/**
 * Parses Solus's eopkg-index.xml (already decompressed) into cache rows.
 * Two shapes the schema needs handling for that Debian/RPM-style
 * repodata doesn't have: `Summary` can repeat per language (English
 * picked by `xml:lang="en"`, verified present on every real package —
 * no fallback-to-first-language case has actually been hit) and there's
 * no single `Version` field — it lives on the most recent `<Update>`
 * entry under `<History>` (verified upstream always lists them newest
 * first, and every real package has at least one). Pure — no I/O.
 */
export function parseIndexXml(xml: string): SolusCacheEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    isArray: (name) => name === "Package" || name === "Summary" || name === "Update",
    parseTagValue: false,
    parseAttributeValue: false,
  });

  const parsed = parser.parse(xml) as { PISI?: { Package?: RawPackage[] } };
  const packages = parsed.PISI?.Package ?? [];

  return packages
    .filter((pkg) => pkg.Name)
    .map((pkg) => {
      const summaries = pkg.Summary ?? [];
      const englishSummary =
        summaries.find((summary) => summary["@_xml:lang"] === "en") ?? summaries[0];

      return {
        name: pkg.Name ?? "",
        summary: englishSummary?.["#text"] ?? "",
        version: pkg.History?.Update?.[0]?.Version ?? "unknown",
        homepage: pkg.Source?.Homepage || undefined,
        partOf: pkg.PartOf || undefined,
      };
    });
}

/**
 * Downloads Solus's eopkg-index.xml.zst and writes the parsed entries to
 * `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchSolus(cachePath: string): Promise<number> {
  const response = await fetch(URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Solus eopkg-index.xml.zst: ${response.status} ${response.statusText}`,
    );
  }

  const compressed = Buffer.from(await response.arrayBuffer());
  const xml = zstdDecompressSync(compressed).toString("utf8");
  const entries = parseIndexXml(xml);

  writeNdjson(cachePath, entries);
  writeMetadata<SolusFetchMetadata>(cachePath, {
    source: "eopkg-solus",
    fetchedAt: new Date().toISOString(),
    url: URL,
    entryCount: entries.length,
  });

  return entries.length;
}
