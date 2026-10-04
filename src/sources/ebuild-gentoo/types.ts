import type { FetchMetadata } from "../_shared/metadata";

/**
 * One ebuild's cached metadata (Portage's `md5-cache`), the shape
 * cached after parsing — already reduced to the latest version per
 * category/package (see `fetch.ts`'s `pickLatestVersion`), unlike every
 * other connector's cache which keeps one row per upstream entry as-is.
 * Deliberately close to the upstream fields rather than the normalized
 * `SourcedPackage` — see `normalize.ts`.
 */
export interface GentooCacheEntry {
  category: string;
  name: string;
  version: string;
  description: string;
  homepage?: string;
  /** The picked version's raw `KEYWORDS` (e.g. `amd64 ~arm64`): per-architecture stability, `~` prefix = testing. Kept raw; `normalize.ts` derives the channel. Absent in caches fetched before this field existed, and on ebuilds with empty keywords (live ebuilds). */
  keywords?: string;
}

export type GentooFetchMetadata = FetchMetadata;
