import type { SourcedPackage } from "../types";
import type { GogCacheEntry } from "./types";

export function normalize(entries: GogCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "gog",
    name: entry.title,
    // The catalog-list endpoint has no description field — only the
    // per-product detail page does, which isn't worth an extra request
    // per entry just for this.
    description: "",
    // GOG sells downloadable installers/DRM-free builds, not versioned
    // packages — there's no real version concept to thread through.
    version: "unknown",
    appId: entry.slug,
    homepage: entry.storeLink ?? `https://www.gog.com/game/${entry.slug}`,
    // Every entry here already passed fetch.ts's productType === "game" filter.
    hasGameCategory: true,
    developer: entry.developers[0],
    screenshots: entry.screenshots.length > 0 ? entry.screenshots : undefined,
    rating: entry.rating,
  }));
}
