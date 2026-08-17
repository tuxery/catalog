import { XMLParser } from "fast-xml-parser";

interface RawRpmPackage {
  name?: string;
  summary?: string;
  version?: { "@_ver"?: string };
  url?: string;
  format?: { "rpm:group"?: string };
}

/**
 * One `<package>` entry from an RPM repo's `primary.xml`, close to the
 * upstream fields rather than any one source's normalized cache shape.
 */
export interface RpmPrimaryEntry {
  name: string;
  summary: string;
  version: string;
  homepage?: string;
  /** RPM `<rpm:group>` value, e.g. "Development/Libraries/C and C++" — "Unspecified" on real data when the packager didn't set one (always Unspecified on Fedora in practice, ~31% of the time on openSUSE). */
  group?: string;
}

/**
 * Finds the current primary metadata's location from `repomd.xml`. RPM
 * repos publish that file with a content-hash prefix that changes on
 * every metadata refresh (e.g. `<hash>-primary.xml.zst`), unlike Debian's
 * fixed `Packages.gz` path — it can't be hardcoded, has to be looked up.
 * Matches `type="primary"` specifically, not `"primary_db"`/`"primary_zck"`
 * (repomd.xml lists several encodings of the same data). Pure — no I/O —
 * so it's covered by tests, same as `parsePrimaryXml`.
 */
export function extractPrimaryLocation(repomdXml: string): string | undefined {
  return repomdXml.match(/<data type="primary">[\s\S]*?<location href="([^"]+)"/)?.[1];
}

/**
 * Parses an RPM repo's primary.xml (already decompressed) into cache rows
 * — shared by Fedora and openSUSE, which publish the identical repodata
 * XML schema (repomd.xml -> content-hashed primary.xml[.zst]), the same
 * situation `deb822.ts` shares between Debian and Ubuntu. Pure — no I/O.
 */
export function parsePrimaryXml(xml: string): RpmPrimaryEntry[] {
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

  const parsed = parser.parse(xml) as { metadata?: { package?: RawRpmPackage[] } };
  const packages = parsed.metadata?.package ?? [];

  return packages
    .filter((pkg) => pkg.name)
    .map((pkg) => ({
      name: pkg.name ?? "",
      summary: pkg.summary ?? "",
      version: pkg.version?.["@_ver"] ?? "unknown",
      homepage: pkg.url || undefined,
      group: pkg.format?.["rpm:group"] || undefined,
    }));
}
