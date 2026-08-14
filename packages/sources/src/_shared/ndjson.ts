import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Reads a newline-delimited JSON file, one typed record per line. A missing
 * file reads as empty — every source's cache starts this way before its
 * `fetch.ts` is implemented.
 */
export function readNdjson<T>(path: string): T[] {
  if (!existsSync(path)) return [];

  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

/**
 * Writes one JSON object per line — keeps git diffs to the lines that
 * actually changed instead of rewriting one giant pretty-printed array.
 */
export function writeNdjson<T>(path: string, rows: T[]): void {
  const content = rows.map((row) => JSON.stringify(row)).join("\n");
  writeFileSync(path, rows.length > 0 ? `${content}\n` : "");
}
