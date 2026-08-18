import { XMLParser } from "fast-xml-parser";

// AppStream also lists "addon"/"runtime"/"localization"/"generic" components
// (extensions, Flatpak runtimes, translation packs, ...) — not apps a user
// would search for in a store.
const APP_TYPES = new Set(["desktop-application", "desktop", "console-application"]);

interface RawTextNode {
  "#text"?: string;
  "@_xml:lang"?: string;
}
type RawText = string | RawTextNode;

interface RawIcon {
  "#text"?: string;
  "@_type"?: string;
}

interface RawUrl {
  "#text"?: string;
  "@_type"?: string;
}

interface RawRelease {
  "@_version"?: string;
}

interface RawComponent {
  "@_type"?: string;
  id?: string;
  name?: RawText[];
  summary?: RawText[];
  icon?: RawIcon[];
  url?: RawUrl[];
  releases?: { release?: RawRelease[] };
  categories?: { category?: string[] };
}

/**
 * One `<component>` entry from an AppStream repodata file, close to the
 * upstream fields rather than any one source's normalized cache shape.
 */
export interface AppstreamComponent {
  /** Flatpak application ID, e.g. "org.mozilla.firefox". */
  id: string;
  name: string;
  summary: string;
  version?: string;
  iconFilename?: string;
  homepage?: string;
  /** Whether `<categories>` includes the freedesktop.org menu spec's "Game" category — see `SourcedPackage.hasGameCategory`. */
  hasGameCategory: boolean;
  /** Every raw `<category>` value, freedesktop.org menu spec identifiers (e.g. "AudioVideo", "Game", "ArcadeGame") — see `SourcedPackage.categories`. */
  categories: string[];
}

/**
 * AppStream repeats `<name>`/`<summary>` once per translation, each tagged
 * with `xml:lang` — except the default (English) entry, which has no
 * `xml:lang` attribute and so parses as a bare string instead of an object.
 */
function pickDefaultText(entries: RawText[] | undefined): string | undefined {
  for (const entry of entries ?? []) {
    if (typeof entry === "string") return entry;
    if (!entry["@_xml:lang"] || entry["@_xml:lang"] === "en") return entry["#text"];
  }
  return undefined;
}

function pickIcon(icons: RawIcon[] | undefined): string | undefined {
  return (
    icons?.find((icon) => icon["@_type"] === "cached")?.["#text"] ??
    icons?.find((icon) => icon["@_type"] === "stock")?.["#text"] ??
    icons?.[0]?.["#text"]
  );
}

function pickHomepage(urls: RawUrl[] | undefined): string | undefined {
  return urls?.find((url) => url["@_type"] === "homepage")?.["#text"];
}

/**
 * Parses an AppStream repodata file (already decompressed) into cache
 * rows — shared by Flathub and elementary AppCenter, which are both
 * Flatpak remotes publishing the identical `appstream.xml.gz` format
 * (repo mechanism, not just coincidentally similar XML), the same
 * situation `deb822.ts`/`rpm-repodata.ts` share between their own
 * respective source pairs. Pure — no I/O.
 */
export function parseAppstreamXml(xml: string): AppstreamComponent[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    isArray: (name) =>
      ["component", "icon", "url", "release", "name", "summary", "category"].includes(name),
    // Without this, fast-xml-parser silently turns purely-numeric text
    // into a JS number — bit Fedora's fetcher for real (a package named
    // "65535" came back as the number 65535). Every field here is meant
    // to stay a string; no known case in this data today, but the
    // failure mode is silent, so defend against it here too.
    parseTagValue: false,
    parseAttributeValue: false,
  });

  const parsed = parser.parse(xml) as { components?: { component?: RawComponent[] } };
  const components = parsed.components?.component ?? [];

  return components
    .filter((component) => APP_TYPES.has(component["@_type"] ?? ""))
    .map((component) => ({
      id: component.id ?? "",
      name: pickDefaultText(component.name) ?? "",
      summary: pickDefaultText(component.summary) ?? "",
      // Releases are listed newest-first — verified against the real
      // Flathub feed, not an assumption from the AppStream spec alone.
      version: component.releases?.release?.[0]?.["@_version"],
      iconFilename: pickIcon(component.icon),
      homepage: pickHomepage(component.url),
      hasGameCategory: (component.categories?.category ?? []).includes("Game"),
      categories: component.categories?.category ?? [],
    }))
    .filter((entry) => entry.id && entry.name);
}
