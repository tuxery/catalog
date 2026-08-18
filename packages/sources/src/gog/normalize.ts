import type { SourcedPackage } from "../types";
import type { GogCacheEntry } from "./types";

export function normalize(entries: GogCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "gog",
    name: entry.title,
    // No description field exists on GOG's catalog-list endpoint at all
    // (verified against real data — only the per-product detail page
    // has one, which would mean 2,000+ extra requests just for this)
    // — same "leave it blank rather than fabricate one" precedent as
    // AppImage's feed, which is frequently blank too.
    description: "",
    // GOG sells downloadable installers/DRM-free builds, not versioned
    // packages the way every other source here is — no real version
    // concept to thread through.
    version: "unknown",
    appId: entry.slug,
    homepage: entry.storeLink ?? `https://www.gog.com/game/${entry.slug}`,
    // Every entry here already passed fetch.ts's productType === "game"
    // filter on GOG's own catalog — unconditional, same reasoning as
    // the Lutris connector.
    hasGameCategory: true,
    developer: entry.developers[0],
    screenshots: entry.screenshots.length > 0 ? entry.screenshots : undefined,
    rating: entry.rating,
  }));
}
