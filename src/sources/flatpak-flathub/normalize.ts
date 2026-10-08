import { isAddonComponent } from "../_shared/appstream";
import type { SourcedPackage } from "../types";
import type { FlathubCacheEntry } from "./types";

export function normalize(entries: FlathubCacheEntry[]): SourcedPackage[] {
  // Add-ons stay out until the curator can attach them to the app they
  // extend as companions — see docs/product-families.md.
  return entries
    .filter((entry) => !isAddonComponent(entry))
    .map((entry) => ({
      source: "flatpak-flathub",
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
      languages: entry.languages,
      changelog: entry.changelog,
      lastUpdated: entry.lastUpdated,
      rating: entry.rating,
      popularity: entry.popularity,
      storeCollections: entry.storeCollections,
      // A verified app is published by its own developer (Flathub checks
      // the app id's domain or code-hosting account); unverified ones may
      // be community-maintained wrappers, so they stay unknown.
      provenance: entry.storeCollections?.includes("verified") ? "upstream" : undefined,
      installsTotal: entry.installsTotal,
      installsLast7Days: entry.installsLast7Days,
      approxSizeBytes: entry.approxSizeBytes,
      formal: entry.formal,
    }));
}
