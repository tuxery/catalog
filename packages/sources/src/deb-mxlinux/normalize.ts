import type { SourcedPackage } from "../types";
import type { MxLinuxCacheEntry } from "./types";

export function normalize(entries: MxLinuxCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "deb-mxlinux",
    name: entry.name,
    description: entry.description,
    version: entry.version,
    // MX Linux package names are unique within the single component/arch
    // fetched here.
    appId: entry.name,
    homepage: entry.homepage,
    section: entry.section,
  }));
}
