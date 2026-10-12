import type { FetchMetadata } from "../_shared/metadata";
import type { ProjectLinks } from "../types";

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
  /** The first feed icon as a fetchable URL on `appimage.github.io/database`. */
  iconUrl?: string;
  /** Feed screenshots as fetchable URLs on `appimage.github.io/database`, in feed order. */
  screenshots?: string[];
  /** The feed's `license`, as the repo's SPDX id or `NOASSERTION`. */
  license?: string;
  /** The feed's `authors` names, comma-joined — the repo's owner and co-authors. */
  developer?: string;
  /** The GitHub repo's page as the source-code link. */
  links?: ProjectLinks;
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
