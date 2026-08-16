import type { FetchMetadata } from "../_shared/metadata";

/**
 * One entry derived from `appimage.github.io/feed.json`'s community feed
 * (not to be confused with the separate AppImageHub.com), the shape
 * cached after fetching. Deliberately close to the upstream feed fields
 * rather than the normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface AppImageCacheEntry {
  name: string;
  description: string;
  /** GitHub "owner/repo" that publishes the AppImage on its Releases page. */
  repo: string;
  /** Latest GitHub Release tag — only resolved when GITHUB_TOKEN is set, see fetch.ts. */
  version?: string;
  iconFilename?: string;
  homepage?: string;
}

export interface AppImageFetchMetadata extends FetchMetadata {
  /** Feed items before filtering out entries with no resolvable GitHub repo. */
  totalFeedItems: number;
  /** How many entries got a real version from GitHub Releases — 0 when GITHUB_TOKEN wasn't set, see fetch.ts. */
  versionsResolved: number;
  /** How many entries were dropped for pointing at a repo confirmed gone (404) — 0 when GITHUB_TOKEN wasn't set, see fetch.ts. */
  deadReposDropped: number;
}
