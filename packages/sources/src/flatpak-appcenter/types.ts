import type { FetchMetadata } from "../_shared/metadata";

/**
 * One `<component>` entry from elementary AppCenter's appstream
 * repodata, the shape cached after parsing. Same shape as Flathub's
 * `FlathubCacheEntry` — both are Flatpak remotes publishing the
 * identical AppStream format — kept as its own named type rather than
 * imported cross-source, matching this codebase's "no single shared
 * cache-row schema" convention.
 */
export interface AppCenterCacheEntry {
  /** Flatpak application ID, e.g. "com.github.akiraux.akira". */
  id: string;
  name: string;
  summary: string;
  version?: string;
  iconFilename?: string;
  /** Resolved, ready-to-use icon URL — see `SourcedPackage.iconUrl`. */
  iconUrl?: string;
  homepage?: string;
  /** Whether AppStream's `<categories>` includes "Game" — see `SourcedPackage.hasGameCategory`. */
  hasGameCategory: boolean;
  /** Every raw `<category>` value — see `SourcedPackage.categories`. */
  categories: string[];
  /** See `SourcedPackage.license`. */
  license?: string;
  /** See `SourcedPackage.developer`. */
  developer?: string;
  /** See `SourcedPackage.longDescription`. */
  longDescription?: string;
  /** See `SourcedPackage.screenshots`. */
  screenshots: string[];
}

export interface AppCenterFetchMetadata extends FetchMetadata {
  /** Repodata architecture fetched — same one-file-per-arch layout as Flathub. */
  arch: string;
}
