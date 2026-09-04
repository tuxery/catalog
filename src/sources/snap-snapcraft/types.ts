import type { FetchMetadata } from "../_shared/metadata";
import type { StoreCollectionTag } from "../types";

/**
 * One entry from `api.snapcraft.io/v2/snaps/find`, the shape cached after
 * fetching. Deliberately close to the upstream API fields rather than the
 * normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface SnapcraftCacheEntry {
  /** Snap name, e.g. "spotify" — also its store identifier. */
  name: string;
  title: string;
  summary: string;
  version: string;
  /** Release channel/track, e.g. "stable", "edge". */
  channel: string;
  iconUrl?: string;
  website?: string;
  /** See `SourcedPackage.storeCollections` — only ever `["featured"]` or `undefined` here, Snapcraft has no verified/recently-added/updated collection API. */
  storeCollections?: StoreCollectionTag[];
  /** See `SourcedPackage.categories` — already translated from Snap's own store-category vocabulary to the freedesktop-equivalent tags `pickCategory` understands, see fetch.ts's `SNAP_CATEGORY_TO_FREEDESKTOP`. */
  categories?: string[];
  /** See `SourcedPackage.hasGameCategory` — set from the dedicated "games" store category sweep, which has no genre granularity to translate. */
  hasGameCategory?: boolean;
}

export interface SnapcraftFetchMetadata extends FetchMetadata {
  /** `Snap-Device-Series` header value sent with every request. */
  deviceSeries: string;
  /** Store categories swept to build this cache — see fetch.ts. */
  categoriesSwept: string[];
  /** Alphabet used to build every `q=` search prefix, recursively deepened where a prefix hits the 100-result cap — see fetch.ts's `sweepQueriesRecursively`. */
  queryCharsSwept: string[];
  /** How many distinct `q=` prefixes were actually queried this run — varies run to run as the store grows/shrinks, unlike `queryCharsSwept` (the fixed alphabet). */
  queryPrefixesTried: number;
}
