import type { SourcedPackage } from "../types";
import type { DebianCacheEntry } from "./types";

export function normalize(entries: DebianCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "debian",
    name: entry.name,
    description: entry.description,
    version: entry.version,
    // Debian package names are unique within a suite/component/arch.
    appId: entry.name,
    homepage: entry.homepage,
  }));
}
