import type { FetchMetadata } from "../_shared/metadata";

/**
 * One entry derived from AppImageHub's community feed
 * (`appimage.github.io/feed.json`), the shape cached after fetching.
 * `version` isn't resolved yet — that needs a per-repo GitHub Releases
 * lookup, not implemented in v1 (see "AppImage version resolution" card).
 * Deliberately close to the upstream feed fields rather than the
 * normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface AppImageCacheEntry {
  name: string;
  description: string;
  /** GitHub "owner/repo" that publishes the AppImage on its Releases page. */
  repo: string;
  version?: string;
  iconFilename?: string;
  homepage?: string;
}

export interface AppImageFetchMetadata extends FetchMetadata {
  /** Feed items before filtering out entries with no resolvable GitHub repo. */
  totalFeedItems: number;
}
