import type { SourcedPackage } from "../types";
import type { DeepinCacheEntry } from "./types";

export function normalize(entries: DeepinCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "deb-deepin",
    name: entry.name,
    description: entry.description,
    version: entry.version,
    // Deepin package names are unique within the single component/arch
    // fetched here (already deduplicated to one row per name — see
    // fetch.ts's dedupeByNewest).
    appId: entry.name,
    homepage: entry.homepage,
    section: entry.section,
  }));
}
