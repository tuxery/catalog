import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseLines, stringifyLines } from "helpers4/json";

/**
 * Reads a newline-delimited JSON file, one typed record per line. A missing
 * file reads as empty — every source's cache starts this way before its
 * `fetch.ts` is implemented.
 */
export function readNdjson<T>(path: string): T[] {
  if (!existsSync(path)) return [];

  return parseLines<T>(readFileSync(path, "utf8"));
}

/**
 * Writes one JSON object per line — keeps git diffs to the lines that
 * actually changed instead of rewriting one giant pretty-printed array.
 */
export function writeNdjson<T>(path: string, rows: T[]): void {
  writeFileSync(path, stringifyLines(rows));
}
