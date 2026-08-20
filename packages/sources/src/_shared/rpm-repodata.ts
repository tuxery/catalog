import { XMLParser } from "fast-xml-parser";
import { fetchText, fetchZstdText } from "./http";

interface RawRpmProvidesEntry {
  "@_name"?: string;
}

interface RawRpmPackage {
  name?: string;
  summary?: string;
  version?: { "@_ver"?: string };
  url?: string;
  format?: {
    "rpm:group"?: string;
    "rpm:provides"?: { "rpm:entry"?: RawRpmProvidesEntry[] };
  };
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
  /** RPM `<rpm:group>` value, e.g. "Development/Libraries/C and C++" — "Unspecified" on real data when the packager didn't set one (Fedora essentially always leaves it unset; openSUSE populates it more often). */
  group?: string;
  /**
   * Whether this package's `<rpm:provides>` includes a synthetic
   * `application(*.desktop)` entry — RPM tooling generates this
   * automatically for any package that ships a `.desktop` file, a
   * near-direct "this installs a launchable GUI app" signal. Low
   * coverage but precise where present — most GUI apps just don't happen
   * to trigger this particular synthetic-provides convention, so absence
   * isn't evidence of "not a GUI app", only presence is meaningful.
   */
  hasDesktopFile: boolean;
}

const DESKTOP_PROVIDES_PATTERN = /^application\(.*\.desktop\)$/;

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
    isArray: (name) => name === "package" || name === "rpm:entry",
    // Without this, fast-xml-parser silently turns purely-numeric text
    // into a JS number — a package literally named "65535" came back as
    // the number 65535, not the string "65535". Every field here is
    // meant to stay a string.
    parseTagValue: false,
    parseAttributeValue: false,
  });

  const parsed = parser.parse(xml) as { metadata?: { package?: RawRpmPackage[] } };
  const packages = parsed.metadata?.package ?? [];

  return packages
    .filter((pkg) => pkg.name)
    .map((pkg) => {
      const provides = pkg.format?.["rpm:provides"]?.["rpm:entry"] ?? [];
      return {
        name: pkg.name ?? "",
        summary: pkg.summary ?? "",
        version: pkg.version?.["@_ver"] ?? "unknown",
        homepage: pkg.url || undefined,
        group: pkg.format?.["rpm:group"] || undefined,
        hasDesktopFile: provides.some((entry) =>
          DESKTOP_PROVIDES_PATTERN.test(entry["@_name"] ?? ""),
        ),
      };
    });
}

/**
 * Downloads one repo's primary.xml — repomd.xml first (to find the
 * current content-hashed `primary.xml.zst` path — RPM repos don't use a
 * fixed filename like Debian's `Packages.gz`), then that file itself,
 * Zstandard-compressed — and returns the decompressed XML text, ready
 * for `parsePrimaryXml`. Shared by Fedora and openSUSE, which were each
 * hand-rolling this identical two-step fetch before this existed —
 * `sourceLabel` (e.g. "Fedora", "openSUSE") only affects error messages.
 */
export async function fetchPrimaryXml(repoBase: string, sourceLabel: string): Promise<string> {
  const repomdXml = await fetchText(
    `${repoBase}/repodata/repomd.xml`,
    `${sourceLabel} repomd.xml at ${repoBase}`,
  );

  const primaryLocation = extractPrimaryLocation(repomdXml);
  if (!primaryLocation) {
    throw new Error(`${sourceLabel} repomd.xml at ${repoBase} has no primary data location`);
  }

  const primaryUrl = `${repoBase}/${primaryLocation}`;
  return fetchZstdText(primaryUrl, `${sourceLabel} primary metadata at ${primaryUrl}`);
}
