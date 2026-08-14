import type { SourcedPackage } from "../types";
import type { FlathubCacheEntry } from "./types";

export function normalize(entries: FlathubCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "flathub",
    name: entry.name,
    description: entry.summary,
    version: entry.version ?? "unknown",
    appId: entry.id,
    iconFilename: entry.iconFilename,
    homepage: entry.homepage,
  }));
}
