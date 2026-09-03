/**
 * Minimal hand-rolled parser for DEP-11 YAML — Debian's AppStream metadata
 * variant, the `dep11/Components-<arch>.yml.gz` file published per
 * suite/component in every Debian-family archive (Ubuntu ships the
 * identical format, the same situation `deb822.ts` covers for Packages
 * files — hence this lives in `_shared/` rather than inside one source's
 * folder).
 *
 * A real YAML library was deliberately not added for this: the DEP-11
 * shape is flat, machine-generated, and regular (verified against the
 * real 545k-line `dists/stable/main` file), and only the subset of keys
 * Tuxery consumes is read — everything else is skipped as one block.
 * The block-skip is indentation-driven: a block ends at the next
 * column-0 `Key:` line, so unknown keys (`Launchable`, `Provides`,
 * `Release`, `ContentRating`, ...) cost nothing and can't break the parse.
 *
 * Languages: DEP-11 repeats every translatable key once per language
 * (`Name: {fr: ..., C: ...}`) — only the untranslated `C:` entry is read,
 * the same "default text, not a translation" rule as `_shared/appstream.ts`.
 * `Description:` values are block scalars (`>-`) holding HTML fragments;
 * they're flattened to plain text with the same paragraph/list conventions
 * the XML path produces (paragraphs separated by blank lines, list items
 * prefixed `- `).
 */

/** One component we kept from a DEP-11 document, close to the upstream fields rather than any one source's normalized cache shape. */
export interface Dep11Component {
  /** DEP-11 component type — only app types survive the parse. */
  type: string;
  /** AppStream desktop-id, e.g. "org.gnome.gitg". */
  id: string;
  /** Binary package name (`Package:`) — the join key to the distro's own package index. */
  pkgname?: string;
  /** Untranslated (`C:`) display name. */
  name?: string;
  /** Untranslated (`C:`) summary. */
  summary?: string;
  /** Untranslated (`C:`) description HTML flattened to plain text. */
  longDescription?: string;
  /** Every raw `Categories:` value, freedesktop.org menu spec identifiers. */
  categories: string[];
  license?: string;
  developer?: string;
  /** `Icon: remote:` url resolved against the document's `MediaBaseUrl` — ready to use directly. `cached`/`stock` icons are theme/filename data with no fetchable URL and are ignored. */
  iconUrl?: string;
  /** `Screenshots: source-image:` urls resolved against `MediaBaseUrl` (thumbnails ignored), in document order. */
  screenshots: string[];
  homepage?: string;
  /** `Languages:` locale codes, in document order. */
  languages?: string[];
}

export interface Dep11Document {
  /** Document-wide media base (`MediaBaseUrl:`) every relative icon/screenshot url resolves against. */
  mediaBaseUrl?: string;
  components: Dep11Component[];
}

// Same app-type set as `_shared/appstream.ts` — addons/fonts/runtimes/etc.
// are not apps a user would search a store for.
const APP_TYPES = new Set(["desktop-application", "console-application"]);

/**
 * Strips matching surrounding single/double quotes from a scalar value —
 * DEP-11 quotes values that collide with YAML syntax (e.g. `'1.0'`).
 */
function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"')))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** A column-0 `Key:` line (or the `---` document separator) — ends whatever block is being consumed. */
function isTopLevelKey(line: string): boolean {
  return line.trim() === "---" || /^[A-Za-z][A-Za-z0-9]*:(?: |$)/.test(line);
}

/** Index of the next top-level key at or after `from` — the end of whatever indented/list block started earlier. */
function nextTopLevelKeyIndex(lines: string[], from: number): number {
  let index = from;
  while (index < lines.length && !isTopLevelKey(lines[index] ?? "")) index += 1;
  return index;
}

/**
 * Resolves a relative icon/screenshot url against the document's
 * `MediaBaseUrl`. Absolute urls pass through untouched; `undefined` when
 * there's no base to resolve against — same positive-evidence-only
 * discipline as everywhere else (no half-built URL).
 */
function resolveMediaUrl(url: string, mediaBaseUrl: string | undefined): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  if (!mediaBaseUrl) return undefined;
  return `${mediaBaseUrl.replace(/\/$/, "")}/${trimmed}`;
}

/**
 * Flattens a DEP-11 `Description` HTML fragment to the same plain-text
 * conventions the shared AppStream XML parser produces: paragraphs
 * separated by blank lines, `<li>` items as `- ` lines, inline markup
 * (`<em>`, `<code>`, ...) stripped, common entities decoded.
 */
export function flattenHtmlDescription(html: string): string {
  const text = html
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/(?:ul|ol|h[1-6]|blockquote|div)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#39|#x27);/g, "'");

  const out: string[] = [];
  let pendingBlank = false;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      pendingBlank = true;
      continue;
    }
    if (pendingBlank && out.length > 0) out.push("");
    pendingBlank = false;
    out.push(line);
  }
  return out.join("\n").trim();
}

/**
 * Reads a two-space-indented language map (`Name:`/`Summary:`), returning
 * the `C:` entry's inline value and the index just past the block. Only
 * inline scalars are supported here — real DEP-11 `Name`/`Summary` values
 * are always one-liners; `undefined` when the map has no `C:` entry.
 */
function readLanguageMapValue(
  lines: string[],
  from: number,
): { value: string | undefined; nextIndex: number } {
  const end = nextTopLevelKeyIndex(lines, from);
  for (let index = from; index < end; index += 1) {
    const match = /^ {2}C:(.*)$/.exec(lines[index] ?? "");
    if (!match) continue;
    const inline = stripQuotes(match[1] ?? "");
    return { value: inline || undefined, nextIndex: end };
  }
  return { value: undefined, nextIndex: end };
}

/**
 * Reads the `C:` entry of a `Description:` translation block. The value is
 * a block scalar (`>-`-style, content indented 4+ spaces, one block per
 * language) — collected until the next two-space language key or top-level
 * key, dedented, and flattened. An inline plain value (`  C: text`) is
 * honored too, though real files use block scalars.
 */
function readDescriptionValue(
  lines: string[],
  from: number,
): { value: string | undefined; nextIndex: number } {
  const end = nextTopLevelKeyIndex(lines, from);
  for (let index = from; index < end; index += 1) {
    const match = /^ {2}C:(.*)$/.exec(lines[index] ?? "");
    if (!match) continue;
    const inline = stripQuotes(match[1] ?? "");
    if (inline && !/^[>|]/.test(inline)) {
      return { value: inline, nextIndex: end };
    }
    // Block scalar: content continues on 4+-space-indented (or blank) lines
    // until the next language key at exactly 2 spaces.
    const block: string[] = [];
    let cursor = index + 1;
    while (cursor < end) {
      const line = lines[cursor] ?? "";
      if (line.trim() === "") {
        block.push("");
        cursor += 1;
        continue;
      }
      const indent = line.length - line.trimStart().length;
      if (indent <= 2) break;
      block.push(line.slice(4));
      cursor += 1;
    }
    return { value: flattenHtmlDescription(block.join("\n")) || undefined, nextIndex: end };
  }
  return { value: undefined, nextIndex: end };
}

/**
 * Parses a DEP-11 YAML document (already decompressed) into its media base
 * and the app-type components Tuxery consumes. Pure — no I/O.
 */
export function parseDep11Yaml(yaml: string): Dep11Document {
  const lines = yaml.split("\n");

  // Header block: `---` / File/Version/Origin/MediaBaseUrl/Time / `---`.
  // A document without the leading separator (a bare component stream) is
  // parsed from the top — nothing to skip.
  let mediaBaseUrl: string | undefined;
  let index = lines.findIndex((line) => line?.trim() === "---");
  if (index === -1) {
    index = 0;
  } else {
    index += 1;
    while (index < lines.length && lines[index]?.trim() !== "---") {
      const match = /^([A-Za-z][A-Za-z0-9]*):(.*)$/.exec(lines[index] ?? "");
      if (match?.[1] === "MediaBaseUrl") mediaBaseUrl = stripQuotes(match[2] ?? "");
      index += 1;
    }
    index += 1;
  }

  const components: Dep11Component[] = [];
  let current: Dep11Component | undefined;

  const pushCurrent = (): void => {
    if (current && APP_TYPES.has(current.type) && current.id && current.pkgname) {
      components.push(current);
    }
    current = undefined;
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const keyMatch = /^([A-Za-z][A-Za-z0-9]*):(.*)$/.exec(line);
    if (!keyMatch) {
      index += 1;
      continue;
    }
    const key = keyMatch[1] as string;
    const inline = stripQuotes(keyMatch[2] ?? "");

    if (key === "Type") {
      pushCurrent();
      current = { type: inline, id: "", categories: [], screenshots: [] };
      index += 1;
      continue;
    }
    if (!current) {
      index += 1;
      continue;
    }

    switch (key) {
      case "ID": {
        current.id = inline;
        index += 1;
        break;
      }
      case "Package": {
        current.pkgname = inline;
        index += 1;
        break;
      }
      case "ProjectLicense": {
        current.license = inline || undefined;
        index += 1;
        break;
      }
      case "Developer": {
        // Two shapes on real data: `name:` as a nested language map at
        // 4-space indent (`    C: Name`) and, rarely, a bare inline scalar
        // (`  name: Name`). An `id:` sibling key carries the developer's
        // AppStream account id, not a display name — ignored.
        const end = nextTopLevelKeyIndex(lines, index + 1);
        let nameInline: string | undefined;
        for (let cursor = index + 1; cursor < end; cursor += 1) {
          const blockLine = lines[cursor] ?? "";
          const inlineName = /^ {2}name: (.+)$/.exec(blockLine);
          if (inlineName) {
            nameInline = stripQuotes(inlineName[1] ?? "");
            continue;
          }
          const translatedName = /^ {4}C: (.+)$/.exec(blockLine);
          if (translatedName && nameInline === undefined) {
            nameInline = stripQuotes(translatedName[1] ?? "");
          }
        }
        current.developer = nameInline || undefined;
        index = end;
        break;
      }
      case "Name":
      case "Summary": {
        const { value, nextIndex } = readLanguageMapValue(lines, index + 1);
        if (value) {
          if (key === "Name") current.name = value;
          else current.summary = value;
        }
        index = nextIndex;
        break;
      }
      case "Description": {
        const { value, nextIndex } = readDescriptionValue(lines, index + 1);
        if (value) current.longDescription = value;
        index = nextIndex;
        break;
      }
      case "Categories": {
        index += 1;
        while (index < lines.length) {
          const item = /^- (.*)$/.exec(lines[index] ?? "");
          if (!item) break;
          current.categories.push(stripQuotes(item[1] ?? ""));
          index += 1;
        }
        break;
      }
      case "Icon": {
        const end = nextTopLevelKeyIndex(lines, index + 1);
        let inRemote = false;
        for (let cursor = index + 1; cursor < end; cursor += 1) {
          const blockLine = lines[cursor] ?? "";
          // Hyphens allowed in sub-key names (`cached`/`remote`/`stock` today).
          const subKey = /^ {2}([A-Za-z][A-Za-z0-9-]*):/.exec(blockLine);
          if (subKey) {
            inRemote = subKey[1] === "remote";
            continue;
          }
          const remoteItem = inRemote ? /^ {2}- url: (.*)$/.exec(blockLine) : undefined;
          if (remoteItem) {
            current.iconUrl ??= resolveMediaUrl(remoteItem[1] ?? "", mediaBaseUrl);
            break;
          }
        }
        index = end;
        break;
      }
      case "Url": {
        const end = nextTopLevelKeyIndex(lines, index + 1);
        for (let cursor = index + 1; cursor < end; cursor += 1) {
          const homepageMatch = /^ {2}homepage: (.*)$/.exec(lines[cursor] ?? "");
          if (homepageMatch) {
            current.homepage = stripQuotes(homepageMatch[1] ?? "") || undefined;
            break;
          }
        }
        index = end;
        break;
      }
      case "Screenshots": {
        const end = nextTopLevelKeyIndex(lines, index + 1);
        let subKey = "";
        for (let cursor = index + 1; cursor < end; cursor += 1) {
          const blockLine = lines[cursor] ?? "";
          // Hyphens allowed in sub-key names (`source-image`).
          const subKeyMatch = /^ {2}([A-Za-z][A-Za-z0-9-]*):/.exec(blockLine);
          if (subKeyMatch) {
            subKey = subKeyMatch[1] as string;
            continue;
          }
          // source-image is a single-url map at 4-space indent; thumbnails
          // (the `  - url:` list form) are deliberately skipped.
          if (subKey === "source-image") {
            const urlMatch = /^ {4}url: (.*)$/.exec(blockLine);
            if (urlMatch) {
              const resolved = resolveMediaUrl(urlMatch[1] ?? "", mediaBaseUrl);
              if (resolved) current.screenshots.push(resolved);
            }
          }
        }
        index = end;
        break;
      }
      case "Languages": {
        const end = nextTopLevelKeyIndex(lines, index + 1);
        for (let cursor = index + 1; cursor < end; cursor += 1) {
          const localeMatch = /^- locale: (.*)$/.exec(lines[cursor] ?? "");
          if (localeMatch) (current.languages ??= []).push(stripQuotes(localeMatch[1] ?? ""));
        }
        index = end;
        break;
      }
      default: {
        index = nextTopLevelKeyIndex(lines, index + 1);
      }
    }
  }
  pushCurrent();

  return { mediaBaseUrl, components };
}
