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
  /** Single-character `q=` search queries swept to build this cache — see fetch.ts. */
  queryCharsSwept: string[];
}
