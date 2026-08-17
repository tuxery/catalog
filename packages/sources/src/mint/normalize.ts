import type { SourcedPackage } from "../types";
import type { MintCacheEntry } from "./types";

export function normalize(entries: MintCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "mint",
    name: entry.name,
    description: entry.description,
    version: entry.version,
    // Mint package names are unique within the single component/arch
    // fetched here.
    appId: entry.name,
    homepage: entry.homepage,
    section: entry.section,
  }));
}
