/**
 * One entry derived from AppImageHub's community feed
 * (`appimage.github.io/feed.json`) plus the matching GitHub repo's latest
 * Release, the shape cached after fetching. Deliberately close to those
 * upstream fields rather than the normalized `SourcedPackage` — see
 * `normalize.ts`.
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
