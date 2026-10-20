import type { FetchMetadata } from "../_shared/metadata";

/**
 * One item of AppImageHub's OCS API (`api.appimagehub.com/ocs/v1/content/
 * data`), the shape cached after fetching. Kept in the private cache only
 * (see `../_shared/cache-path.ts`): opendesktop.org's names, summaries and
 * versions are written by their uploaders and may not be redistributed.
 * No image or download URL is kept: download links are signed and expire,
 * and their pictures weren't part of what was allowed.
 */
export interface AppImageHubCacheEntry {
  /** OCS content id, e.g. "2367450". */
  id: string;
  name: string;
  /** The store's category, e.g. "Audioplayers" — free to use, per opendesktop.org. */
  typename: string;
  summary: string;
  /** The uploader's version string; the first download's when the item has none. */
  version?: string;
  /** The store's tags (`gplv3`, `x86-64`, `release-stable`, `original-product`, ...) — free to use. */
  tags: string[];
  /** `https://www.appimagehub.com/p/<id>`: where every app using this data must send people to download, with "Source: AppImageHub". */
  detailpage: string;
  /** Last change on the store (ISO), for incremental sweeps. */
  changed?: string;
}

export interface AppImageHubFetchMetadata extends FetchMetadata {
  /** Pages fetched, at `PAGE_SIZE` items each. */
  pagesFetched: number;
}
