import { existsSync, readFileSync } from "node:fs";
import type { ZodType } from "zod";

/**
 * Reads a `config/`-style hand-edited JSON array config file, validated
 * against `schema` — a malformed entry fails loud and points at the
 * exact field, right at load time, rather than surfacing as a confusing
 * bug somewhere downstream (the previous `JSON.parse(...) as T` never
 * actually checked anything). A missing file reads as empty — override
 * lists (filter's keep/exclude, match's force/deny, enrich's
 * tags/warnings/suites) start empty and are filled in by hand as
 * exceptions are found, not generated. Read-only: nothing here ever
 * writes one of these files back out.
 */
export function readJson<T>(path: string, schema: ZodType<T[]>): T[] {
  if (!existsSync(path)) return [];

  return schema.parse(JSON.parse(readFileSync(path, "utf8")));
}
