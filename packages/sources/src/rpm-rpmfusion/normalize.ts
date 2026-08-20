import type { SourcedPackage } from "../types";
import type { RpmFusionCacheEntry } from "./types";

export function normalize(entries: RpmFusionCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "rpm-rpmfusion",
    name: entry.name,
    description: entry.summary,
    version: entry.version,
    // RPM package names are unique within a release/repo/arch.
    appId: entry.name,
    homepage: entry.homepage,
    section: entry.group,
    hasDesktopFile: entry.hasDesktopFile,
  }));
}
