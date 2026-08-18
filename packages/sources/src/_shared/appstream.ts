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
  "@_scale"?: string;
}

interface RawUrl {
  "#text"?: string;
  "@_type"?: string;
}

interface RawRelease {
  "@_version"?: string;
}

interface RawDeveloper {
  name?: RawText[];
}

// <p>/<li> text can carry nested inline markup (<em>, <code>, ...) — real
// data hit this live ("app.authpass.AuthPass" has a <p><em>...</em></p>)
// — which fast-xml-parser turns into a nested object instead of a plain
// string. `unknown` here (extracted via `extractText`) rather than
// `string`, since a plain string is only the common case, not guaranteed.
interface RawList {
  li?: unknown[];
}

interface RawDescription {
  "@_xml:lang"?: string;
  p?: unknown[];
  ul?: RawList[];
  ol?: RawList[];
}

interface RawScreenshotImage {
  "#text"?: string;
  "@_type"?: string;
}

interface RawScreenshot {
  image?: RawScreenshotImage[];
}

interface RawComponent {
  "@_type"?: string;
  id?: string;
  name?: RawText[];
  summary?: RawText[];
  description?: RawDescription[];
  icon?: RawIcon[];
  url?: RawUrl[];
  releases?: { release?: RawRelease[] };
  categories?: { category?: string[] };
  project_license?: string;
  developer_name?: string;
  developer?: RawDeveloper;
  screenshots?: { screenshot?: RawScreenshot[] };
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
  /** Bare filename of a `type="cached"`/`type="stock"` icon (e.g. "org.mozilla.firefox.png") — not fetchable on its own, kept for matching purposes. See `remoteIconUrl` for a ready-to-use URL. */
  iconFilename?: string;
  /** A `type="remote"` icon's full URL, when present — ready to use directly, no base-URL resolution needed. Not every source's repo publishes this (verified: 100% of real Flathub components do, only ~8% of AppCenter's); callers needing an icon URL for a source without it must resolve `iconFilename` against that source's own repo layout instead. */
  remoteIconUrl?: string;
  homepage?: string;
  /** Whether `<categories>` includes the freedesktop.org menu spec's "Game" category — see `SourcedPackage.hasGameCategory`. */
  hasGameCategory: boolean;
  /** Every raw `<category>` value, freedesktop.org menu spec identifiers (e.g. "AudioVideo", "Game", "ArcadeGame") — see `SourcedPackage.categories`. */
  categories: string[];
  /** SPDX-ish license expression from `<project_license>` (e.g. "GPL-3.0+ AND LGPL-3.0+") — see `SourcedPackage.license`. */
  license?: string;
  /** From `<developer_name>` (the common case, a bare untranslated string) or the newer `<developer><name>` form (translated like `<name>`/`<summary>`) — see `SourcedPackage.developer`. */
  developer?: string;
  /** `<description>`'s `<p>` paragraphs and `<ul>`/`<ol>` list items, flattened to plain text (paragraphs joined by blank lines, list items as "- " bullets) — the interleaved order between paragraphs and lists isn't preserved, only within each kind. See `SourcedPackage.longDescription`. */
  longDescription?: string;
  /** Every screenshot's `type="source"` image URL (falling back to the first available size when there's no source-tagged one) — always a full URL already, verified against real data. See `SourcedPackage.screenshots`. */
  screenshots: string[];
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

/** Prefers a non-HiDPI (`scale` unset or "1") `type="remote"` icon over an `@_scale="2"` variant, when both exist. */
function pickRemoteIconUrl(icons: RawIcon[] | undefined): string | undefined {
  const remote = icons?.filter((icon) => icon["@_type"] === "remote") ?? [];
  return (
    remote.find((icon) => !icon["@_scale"] || icon["@_scale"] === "1")?.["#text"] ??
    remote[0]?.["#text"]
  );
}

function pickHomepage(urls: RawUrl[] | undefined): string | undefined {
  return urls?.find((url) => url["@_type"] === "homepage")?.["#text"];
}

/**
 * Resolves a component's icon to a fetchable URL — `remoteIconUrl`
 * directly when present, else `iconFilename` joined against `repoBase`
 * (that source's own repo directory, e.g.
 * `https://dl.flathub.org/repo/appstream/x86_64`), matching every real
 * AppStream repo's `icons/<size>x<size>/<filename>` layout (verified
 * live against both Flathub and elementary AppCenter). Each connector
 * passes its own `repoBase` since the shared parser doesn't know which
 * repo it's parsing. `remoteIconUrl` alone covers 100% of real Flathub
 * components; AppCenter has it on only ~8%, so the fallback carries most
 * of AppCenter's real coverage.
 */
export function resolveIconUrl(
  component: Pick<AppstreamComponent, "remoteIconUrl" | "iconFilename">,
  repoBase: string,
): string | undefined {
  if (component.remoteIconUrl) return component.remoteIconUrl;
  return component.iconFilename ? `${repoBase}/icons/128x128/${component.iconFilename}` : undefined;
}

function pickDeveloper(component: RawComponent): string | undefined {
  return component.developer_name || pickDefaultText(component.developer?.name);
}

/**
 * Recursively concatenates every string leaf in a parsed XML value,
 * ignoring tag/attribute structure — for `<p>`/`<li>` content that's
 * either a plain string (the common case) or, when it carries nested
 * inline markup (`<em>`, `<code>`, ...), an object fast-xml-parser
 * produces instead. Attribute keys (`@_...`) are skipped since they're
 * markup metadata, not text content.
 */
function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractText).join("");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => !key.startsWith("@_"))
      .map(([, child]) => extractText(child))
      .join("");
  }
  return "";
}

// Collapses the source XML's own indentation/line-wrapping whitespace
// inside each <p>/<li> (real data has it, e.g. GIMP's description is
// hand-indented at ~6 spaces per line) down to single spaces, the same
// whitespace-collapsing a browser applies to HTML text nodes — without
// it, every wrapped line keeps its raw leading spaces in the plain-text
// output.
function cleanText(value: unknown): string {
  return extractText(value).replace(/\s+/g, " ").trim();
}

/**
 * Flattens `<description>`'s `<p>` paragraphs and `<ul>`/`<ol>` list
 * items to plain text — real AppStream descriptions interleave both
 * (verified: "Jan" on Flathub has intro paragraphs, a "Features" `<ul>`,
 * then a closing paragraph). Paragraphs join with blank lines, list
 * items become "- " bullets; the original interleaving order between
 * paragraphs and lists isn't reconstructed (fast-xml-parser's default,
 * non-order-preserving mode groups all `<p>` together and all
 * `<ul>`/`<ol>` together), a readable approximation rather than a exact
 * reproduction.
 *
 * `<description>` itself repeats once per translation, same `xml:lang`
 * pattern as `<name>`/`<summary>` — verified against real data (GIMP has
 * 30 of them) — a real bug caught live: without picking just the default
 * one first, `<p>` text from every language's block gets flattened
 * together indiscriminately.
 */
function pickLongDescription(descriptions: RawDescription[] | undefined): string | undefined {
  const description = (descriptions ?? []).find(
    (entry) => !entry["@_xml:lang"] || entry["@_xml:lang"] === "en",
  );
  if (!description) return undefined;

  const paragraphs = (description.p ?? []).map((p) => cleanText(p)).filter(Boolean);
  const items = [...(description.ul ?? []), ...(description.ol ?? [])].flatMap(
    (list) => list.li ?? [],
  );

  const parts = [...paragraphs];
  if (items.length > 0) {
    parts.push(items.map((item) => `- ${cleanText(item)}`).join("\n"));
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

function pickScreenshots(screenshots: { screenshot?: RawScreenshot[] } | undefined): string[] {
  return (screenshots?.screenshot ?? [])
    .map((screenshot) => {
      const images = screenshot.image ?? [];
      return (
        images.find((image) => image["@_type"] === "source")?.["#text"] ?? images[0]?.["#text"]
      );
    })
    .filter((url): url is string => Boolean(url));
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
      [
        "component",
        "icon",
        "url",
        "release",
        "name",
        "summary",
        "description",
        "category",
        "p",
        "li",
        "ul",
        "ol",
        "screenshot",
        "image",
      ].includes(name),
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
      remoteIconUrl: pickRemoteIconUrl(component.icon),
      homepage: pickHomepage(component.url),
      hasGameCategory: (component.categories?.category ?? []).includes("Game"),
      categories: component.categories?.category ?? [],
      license: component.project_license,
      developer: pickDeveloper(component),
      longDescription: pickLongDescription(component.description),
      screenshots: pickScreenshots(component.screenshots),
    }))
    .filter((entry) => entry.id && entry.name);
}
