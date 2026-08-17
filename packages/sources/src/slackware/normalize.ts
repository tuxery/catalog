import type { SourcedPackage } from "../types";
import type { SlackwareCacheEntry } from "./types";

export function normalize(entries: SlackwareCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "slackware",
    name: entry.name,
    description: entry.summary,
    version: entry.version,
    // Slackware package names are unique within the single tree fetched
    // here (no repo/component split to worry about, unlike most other
    // native sources).
    appId: entry.name,
    homepage: entry.homepage,
    section: entry.series,
  }));
}
