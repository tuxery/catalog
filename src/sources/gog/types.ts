import type { FetchMetadata } from "../_shared/metadata";
import type { AgeRating } from "../types";

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
  /** The catalog's `publishers`, comma-joined — see `SourcedPackage.publisher`. Often the developer itself. */
  publisher?: string;
  /** The game's square icon from `api.gog.com/products/<id>` (`images.icon`), absent when that call failed. */
  iconUrl?: string;
  /** The product page's description (`description.full`, else `lead`) flattened from HTML to plain text, absent when that call failed. */
  longDescription?: string;
  /** Screenshot URLs with the size placeholder already resolved — see `fetch.ts`'s `resolveScreenshotUrl`. */
  screenshots: string[];
  /** See `SourcedPackage.rating` — only set when GOG reports at least one real review; unreviewed products report `reviewsRating: 0, reviewsCount: 0`, dropped rather than kept as a fake zero rating. */
  rating?: { average: number; count: number };
  /** GOG's own genre tag slugs (e.g. "rpg", "strategy", "pointandclick") — see `normalize.ts`'s GOG_GENRE_SLUG_TO_GENRE_CATEGORY for how these map to a `categories-games.json` genre. */
  genres: string[];
  /** See `SourcedPackage.ageRating`: PEGI, else ESRB, else USK. */
  ageRating?: AgeRating;
}

export interface GogFetchMetadata extends FetchMetadata {
  /** Server-side filter used to scope the catalog to Linux-compatible products — see fetch.ts. */
  systemsFilter: string;
  /** How many products got their icon and description from `api.gog.com/products` — the rest keep the catalog list's fields only. */
  detailsFetched: number;
  /** Total pages fetched, at `LIMIT` products each. */
  pagesFetched: number;
}
