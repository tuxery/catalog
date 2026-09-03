import type { SourcedPackage } from "../types";
import type { OpenSuseAppstreamCacheEntry } from "./types";

export function normalize(entries: OpenSuseAppstreamCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "rpm-opensuse-appstream",
    // The package name is the join key to the rpm-opensuse source; the
    // human-readable AppStream name stays as the display name.
    name: entry.name,
    description: entry.summary,
    version: entry.version ?? "unknown",
    appId: entry.pkgname,
    iconFilename: entry.iconFilename,
    iconUrl: entry.remoteIconUrl,
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
  }));
}
