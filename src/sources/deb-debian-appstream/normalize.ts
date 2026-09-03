import type { SourcedPackage } from "../types";
import type { DebianAppstreamCacheEntry } from "./types";

export function normalize(entries: DebianAppstreamCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "deb-debian-appstream",
    // The binary package name is the join key to deb-debian/deb-ubuntu
    // (exact-appId matching); the human-readable AppStream name stays as
    // the display name.
    name: entry.name,
    description: entry.summary,
    version: "unknown",
    appId: entry.pkgname,
    iconUrl: entry.iconUrl,
    homepage: entry.homepage,
    hasGameCategory: entry.hasGameCategory,
    categories: entry.categories,
    license: entry.license,
    developer: entry.developer,
    longDescription: entry.longDescription,
    screenshots: entry.screenshots.length > 0 ? entry.screenshots : undefined,
    languages: entry.languages,
  }));
}
