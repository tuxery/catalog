import type { SourcedPackage } from "../types";
import type { SnapcraftCacheEntry } from "./types";

export function normalize(entries: SnapcraftCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "snapcraft",
    name: entry.title,
    description: entry.summary,
    version: entry.version,
    appId: entry.name,
    channel: entry.channel,
    // iconUrl is a full URL, unlike Flathub's bare filename — take just the
    // last path segment so the matcher compares like with like.
    iconFilename: entry.iconUrl?.split("/").pop(),
    homepage: entry.website,
  }));
}
