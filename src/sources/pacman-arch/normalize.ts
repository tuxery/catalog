import type { SourcedPackage } from "../types";
import type { ArchCacheEntry } from "./types";

export function normalize(entries: ArchCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "pacman-arch",
    name: entry.name,
    description: entry.description,
    version: entry.version,
    // Arch package names are unique across core+extra together.
    appId: entry.name,
    homepage: entry.homepage,
    // entry.repo (core/extra) isn't threaded through yet — SourcedPackage
    // has no slot for it, though it stays available in the cache row
    // either way.
  }));
}
