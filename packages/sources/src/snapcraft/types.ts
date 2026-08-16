import type { FetchMetadata } from "../_shared/metadata";

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
}

export interface SnapcraftFetchMetadata extends FetchMetadata {
  /** `Snap-Device-Series` header value sent with every request. */
  deviceSeries: string;
  /** Store categories swept to build this cache — see fetch.ts. */
  categoriesSwept: string[];
  /** Single-character `q=` search queries swept to build this cache — see fetch.ts. */
  queryCharsSwept: string[];
}
