import type { SourcedPackage } from "../types";
import type { AppCenterCacheEntry } from "./types";

export function normalize(entries: AppCenterCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "flatpak-appcenter",
    name: entry.name,
    description: entry.summary,
    version: entry.version ?? "unknown",
    appId: entry.id,
    iconFilename: entry.iconFilename,
    iconUrl: entry.iconUrl,
    homepage: entry.homepage,
    hasGameCategory: entry.hasGameCategory,
    categories: entry.categories,
    license: entry.license,
    developer: entry.developer,
    longDescription: entry.longDescription,
    screenshots: entry.screenshots.length > 0 ? entry.screenshots : undefined,
    rating: entry.rating,
  }));
}
