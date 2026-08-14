import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { FilterOverrideEntry } from "./types";

const KEEP_PATH = fileURLToPath(new URL("../../overrides/keep.ndjson", import.meta.url));
const EXCLUDE_PATH = fileURLToPath(new URL("../../overrides/exclude.ndjson", import.meta.url));

function overrideKey(entry: Pick<FilterOverrideEntry, "source" | "name">): string {
  return `${entry.source}:${entry.name}`;
}

export interface FilterOverrides {
  keep: Set<string>;
  exclude: Set<string>;
}

/** Loads both override lists (missing files read as empty) into lookup sets keyed by `source:name`. */
export function loadFilterOverrides(): FilterOverrides {
  return {
    keep: new Set(readNdjson<FilterOverrideEntry>(KEEP_PATH).map(overrideKey)),
    exclude: new Set(readNdjson<FilterOverrideEntry>(EXCLUDE_PATH).map(overrideKey)),
  };
}

export { overrideKey };
