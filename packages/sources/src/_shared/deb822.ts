/**
 * Parses deb822-format stanzas — used by Debian's `Packages` files and by
 * derivatives like Ubuntu that publish the exact same format — into plain
 * field maps. Continuation lines (long descriptions, multi-line `Depends`/
 * `Tag` fields) are skipped entirely; only the first line of each field is
 * kept, which for `Description` is exactly the short summary a store
 * would want anyway.
 */
export function parseDeb822(text: string): Record<string, string>[] {
  const stanzas: Record<string, string>[] = [];

  for (const block of text.split(/\r?\n\r?\n+/)) {
    const fields: Record<string, string> = {};

    for (const line of block.split(/\r?\n/)) {
      if (line === "" || /^[ \t]/.test(line)) continue;
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) continue;
      fields[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1).trim();
    }

    if (Object.keys(fields).length > 0) stanzas.push(fields);
  }

  return stanzas;
}
