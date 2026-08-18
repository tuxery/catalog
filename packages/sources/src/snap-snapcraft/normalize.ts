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
    // like, but also keep the full URL itself (previously discarded here
    // entirely — see the "Populate CatalogApp rich fields per source"
    // card, which flagged this as a regression to fix before iconUrl
    // population started).
    iconFilename: entry.iconUrl?.split("/").pop(),
    iconUrl: entry.iconUrl,
    homepage: entry.website,
  }));
}
