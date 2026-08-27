import { fileURLToPath } from "node:url";
import { readJson } from "../_shared/json";
import type { FilterOverrideEntry } from "./types";

const KEEP_PATH = fileURLToPath(new URL("../../../config/filter-keep.json", import.meta.url));
const EXCLUDE_PATH = fileURLToPath(new URL("../../../config/filter-exclude.json", import.meta.url));

function overrideKey(entry: { source: string; name: string }): string {
  return `${entry.source}:${entry.name}`;
}

export interface FilterOverrides {
  keep: Set<string>;
  exclude: Set<string>;
}

/** Expands one `{sources: [...], name}` entry into one `source:name` key per listed source. */
function expandKeys(entries: FilterOverrideEntry[]): string[] {
  return entries.flatMap((entry) =>
    entry.sources.map((source) => overrideKey({ source, name: entry.name })),
  );
}

/** Loads both override lists (missing files read as empty) into lookup sets keyed by `source:name`. */
export function loadFilterOverrides(): FilterOverrides {
  return {
    keep: new Set(expandKeys(readJson<FilterOverrideEntry>(KEEP_PATH))),
    exclude: new Set(expandKeys(readJson<FilterOverrideEntry>(EXCLUDE_PATH))),
  };
}

export { overrideKey };
