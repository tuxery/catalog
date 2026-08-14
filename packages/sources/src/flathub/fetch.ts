import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { FlathubCacheEntry, FlathubFetchMetadata } from "./types";

// Flathub publishes one appstream file per arch — this is the one most
// desktop Linux installs actually run on. aarch64 is available at the same
// path with the arch swapped, if/when Tuxery needs it.
const ARCH = "x86_64";
const APPSTREAM_URL = `https://dl.flathub.org/repo/appstream/${ARCH}/appstream.xml.gz`;

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
 * Parses Flathub's appstream XML (already decompressed) into cache rows.
 * Pure — no I/O — so it's the part covered by tests; `fetchFlathub` is thin
 * glue around this plus the network call and gunzip.
 */
export function parseAppstream(xml: string): FlathubCacheEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    isArray: (name) => ["component", "icon", "url", "release", "name", "summary"].includes(name),
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
    }))
    .filter((entry) => entry.id && entry.name);
}

/**
 * Downloads Flathub's appstream repodata — the same file real Flatpak
 * clients use to discover apps — and writes the normalized entries to
 * `cachePath` as NDJSON. Single gzipped XML file, no auth, no pagination;
 * see docs/sources.md.
 */
export async function fetchFlathub(cachePath: string): Promise<number> {
  const response = await fetch(APPSTREAM_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Flathub appstream: ${response.status} ${response.statusText}`);
  }

  const compressed = Buffer.from(await response.arrayBuffer());
  const xml = gunzipSync(compressed).toString("utf8");
  const entries = parseAppstream(xml);

  writeNdjson(cachePath, entries);
  writeMetadata<FlathubFetchMetadata>(cachePath, {
    source: "flathub",
    fetchedAt: new Date().toISOString(),
    url: APPSTREAM_URL,
    entryCount: entries.length,
    arch: ARCH,
  });

  return entries.length;
}
