/**
 * One deb822 stanza, both parsed and raw. `fields` drops continuation
 * lines the same way `parseDeb822` always has (see its doc comment); `raw`
 * keeps the stanza's original text so a caller can still recover a
 * multi-line field's full value when it needs to — see `parseDebtags`.
 */
export interface Deb822Stanza {
  fields: Record<string, string>;
  raw: string;
}

/**
 * Parses deb822-format stanzas — used by Debian's `Packages` files and by
 * derivatives like Ubuntu that publish the exact same format — keeping
 * each stanza's raw text alongside its parsed field map. Continuation
 * lines (long descriptions, multi-line `Depends`/`Tag` fields) are
 * skipped entirely from `fields`; only the first line of each field ends
 * up there, which for `Description` is exactly the short summary a store
 * would want anyway. `raw` is for the rare caller that needs more than
 * that first line (e.g. Debian's `Tag:` field, which commonly wraps).
 */
export function parseDeb822Stanzas(text: string): Deb822Stanza[] {
  const stanzas: Deb822Stanza[] = [];

  for (const block of text.split(/\r?\n\r?\n+/)) {
    const fields: Record<string, string> = {};

    for (const line of block.split(/\r?\n/)) {
      if (line === "" || /^[ \t]/.test(line)) continue;
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) continue;
      fields[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1).trim();
    }

    if (Object.keys(fields).length > 0) stanzas.push({ fields, raw: block });
  }

  return stanzas;
}

/**
 * Parses deb822-format stanzas into plain field maps — see
 * `parseDeb822Stanzas` for the full stanza shape (fields + raw text) this
 * is a thin projection of, kept around since it's still what most callers
 * (every one that doesn't need a multi-line field) actually want.
 */
export function parseDeb822(text: string): Record<string, string>[] {
  return parseDeb822Stanzas(text).map((stanza) => stanza.fields);
}

// Debian's own archive-wide Debtags database gets embedded directly into
// its Packages files as a `Tag:` field (e.g. "game::strategy,
// interface::graphical, ..., use::gameplaying") -- verified live
// 2026-09-04: absent from Ubuntu/Mint's Packages.gz (their archives strip
// it), but present on ~37% of Debian stable main's ~68.7k packages
// (25,607 of them). Real, per-package classification signal, comparable
// to GOG's genres or AUR's Keywords -- but wraps across continuation
// lines on the majority of real entries (see the fixture in
// deb822.spec.ts), which `parseDeb822`'s field map silently truncates to
// whatever fits on the first line. Read from `raw` instead so the full
// list survives.
const TAG_FIELD_PATTERN = /^Tag:[ \t]*(.*(?:\n[ \t].*)*)/m;

/**
 * Extracts a stanza's full `Tag:` value (Debian's Debtags) from its raw
 * text, reconstructing continuation lines `parseDeb822`'s field map would
 * otherwise drop — see the module-level comment above. Pure — no I/O.
 */
export function parseDebtags(raw: string): string[] {
  const match = raw.match(TAG_FIELD_PATTERN);
  if (!match?.[1]) return [];

  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .join(" ")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}
