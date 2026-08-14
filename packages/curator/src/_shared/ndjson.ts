import { existsSync, readFileSync } from "node:fs";

/**
 * Reads a newline-delimited JSON file, one typed record per line. A
 * missing file reads as empty — override lists (filter's keep/exclude,
 * match's manual/deny) start empty and are filled in by hand as
 * exceptions are found, not generated. Read-only: unlike
 * `@tuxery/sources`'s `_shared/ndjson.ts`, nothing here ever writes one
 * of these files back out.
 */
export function readNdjson<T>(path: string): T[] {
  if (!existsSync(path)) return [];

  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}
