import type { SourcedPackage } from "../types";
import type { PopOsCacheEntry } from "./types";

export function normalize(entries: PopOsCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "popos",
    name: entry.name,
    description: entry.description,
    version: entry.version,
    // Pop!_OS package names are unique within the single component/arch
    // fetched here.
    appId: entry.name,
    homepage: entry.homepage,
    section: entry.section,
  }));
}
