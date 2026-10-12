import type { SourcedPackage } from "../types";
import type { UbuntuAppstreamCacheEntry } from "./types";

export function normalize(entries: UbuntuAppstreamCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "deb-ubuntu-appstream",
    // The binary package name is the join key to deb-ubuntu (exact-appId
    // matching); the human-readable AppStream name stays as the display name.
    name: entry.name,
    description: entry.summary,
    version: "unknown",
    appId: entry.pkgname,
    appstreamId: entry.id,
    iconUrl: entry.iconUrl,
    homepage: entry.homepage,
    links: entry.links,
    hasGameCategory: entry.hasGameCategory,
    categories: entry.categories,
    license: entry.license,
    developer: entry.developer,
    longDescription: entry.longDescription,
    screenshots: entry.screenshots.length > 0 ? entry.screenshots : undefined,
    ageRating: entry.ageRating,
    requirements: entry.requirements,
    languages: entry.languages,
  }));
}
