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
