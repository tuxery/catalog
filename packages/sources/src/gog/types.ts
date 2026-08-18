import type { FetchMetadata } from "../_shared/metadata";

/**
 * One product from GOG's catalog API (catalog.gog.com/v1/catalog), the
 * shape cached after parsing. Deliberately close to the upstream fields
 * rather than the normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface GogCacheEntry {
  /** GOG's own numeric product id (as a string), e.g. "1459256379". */
  id: string;
  title: string;
  /** URL-safe product slug, e.g. "firewatch" — used to build the store page URL when `storeLink` is missing. */
  slug: string;
  /** Real product page URL, when the API provides one — see `fetch.ts`'s fallback for when it doesn't. */
  storeLink?: string;
  developers: string[];
  /** Screenshot URLs with the size placeholder already resolved to a real, verified-working image — see `fetch.ts`'s `resolveScreenshotUrl`. */
  screenshots: string[];
  /** See `SourcedPackage.rating` — only set when GOG reports at least one real review (verified live: unreviewed products report `reviewsRating: 0, reviewsCount: 0`, dropped rather than kept as a fake zero rating). */
  rating?: { average: number; count: number };
}

export interface GogFetchMetadata extends FetchMetadata {
  /** Server-side filter used to scope the catalog to Linux-compatible products — see fetch.ts. */
  systemsFilter: string;
  /** Total pages fetched, at `LIMIT` products each. */
  pagesFetched: number;
}
