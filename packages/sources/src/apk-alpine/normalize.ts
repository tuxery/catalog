import type { SourcedPackage } from "../types";
import type { AlpineCacheEntry } from "./types";

export function normalize(entries: AlpineCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "apk-alpine",
    name: entry.name,
    description: entry.description,
    version: entry.version,
    // Alpine/apk package names are unique within a repo/arch, and
    // verified unique across main + community too (disjoint, no overlap
    // in the real data) — see fetch.ts.
    appId: entry.name,
    homepage: entry.homepage,
  }));
}
