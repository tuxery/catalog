import type { SourcedPackage } from "../types";
import type { FlathubCacheEntry } from "./types";

export function normalize(entries: FlathubCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "flatpak-flathub",
    name: entry.name,
    description: entry.summary,
    version: entry.version ?? "unknown",
    appId: entry.id,
    // The only branch this connector fetches is Flathub's stable repo
    // (`dl.flathub.org/repo`); its separate beta repo isn't read, so every
    // package is stable by construction. Recorded explicitly rather than
    // left undefined, like the other sources that pick one track.
    channel: "stable",
    iconFilename: entry.iconFilename,
    iconUrl: entry.iconUrl,
    homepage: entry.homepage,
    hasGameCategory: entry.hasGameCategory,
    categories: entry.categories,
    license: entry.license,
    developer: entry.developer,
    longDescription: entry.longDescription,
    screenshots: entry.screenshots.length > 0 ? entry.screenshots : undefined,
    languages: entry.languages,
    changelog: entry.changelog,
    lastUpdated: entry.lastUpdated,
    rating: entry.rating,
    popularity: entry.popularity,
    storeCollections: entry.storeCollections,
    installsTotal: entry.installsTotal,
    installsLast7Days: entry.installsLast7Days,
    approxSizeBytes: entry.approxSizeBytes,
  }));
}
