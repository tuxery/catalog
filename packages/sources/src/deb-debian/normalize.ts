import type { SourcedPackage } from "../types";
import type { DebianCacheEntry } from "./types";

export function normalize(entries: DebianCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "deb-debian",
    name: entry.name,
    description: entry.description,
    version: entry.version,
    // Debian package names are unique within a suite/component/arch.
    appId: entry.name,
    homepage: entry.homepage,
    section: entry.section,
    // entry.component isn't threaded through yet — SourcedPackage has no
    // slot for it. See the "Thread arch/channel into SourcedPackage
    // consistently" card; it stays available in the cache row either way.
  }));
}
