import type { SourcedPackage } from "../types";
import type { SnapcraftCacheEntry } from "./types";

export function normalize(entries: SnapcraftCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "snap-snapcraft",
    name: entry.title,
    description: entry.summary,
    version: entry.version,
    appId: entry.name,
    channel: entry.channel,
    // iconUrl is a full URL, unlike Flathub's bare filename — take just the
    // last path segment for iconFilename so the matcher compares like with
    // like, while still keeping the full URL for iconUrl.
    iconFilename: entry.iconUrl?.split("/").pop(),
    iconUrl: entry.iconUrl,
    homepage: entry.website,
  }));
}
