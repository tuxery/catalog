import type { SourcedPackage } from "../types";
import type { SolusCacheEntry } from "./types";

export function normalize(entries: SolusCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "solus",
    name: entry.name,
    description: entry.summary,
    version: entry.version,
    // Solus/eopkg package names are unique within the single repo fetched
    // here.
    appId: entry.name,
    homepage: entry.homepage,
    section: entry.partOf,
  }));
}
