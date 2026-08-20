import type { SourcedPackage } from "../types";
import type { OpenSuseCacheEntry } from "./types";

export function normalize(entries: OpenSuseCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "rpm-opensuse",
    name: entry.name,
    description: entry.summary,
    version: entry.version,
    // openSUSE/RPM package names are unique within a repo/arch, and
    // unique across oss + non-oss too since they're disjoint components
    // with no overlap — see fetch.ts.
    appId: entry.name,
    homepage: entry.homepage,
    section: entry.group,
    hasDesktopFile: entry.hasDesktopFile,
  }));
}
