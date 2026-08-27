import { existsSync, readFileSync } from "node:fs";

/**
 * Reads a `config/`-style hand-edited JSON array config file. A missing
 * file reads as empty — override lists (filter's keep/exclude, match's
 * force/deny, enrich's tags/warnings/suites) start empty and are filled
 * in by hand as exceptions are found, not generated. Read-only: nothing
 * here ever writes one of these files back out.
 */
export function readJson<T>(path: string): T[] {
  if (!existsSync(path)) return [];

  return JSON.parse(readFileSync(path, "utf8")) as T[];
}
