import type { FetchMetadata } from "../_shared/metadata";
import type { StoreCollectionTag } from "../types";

/**
 * One `<component>` entry from Flathub's appstream repodata
 * (`dl.flathub.org/repo/appstream/x86_64/appstream.xml.gz`), the shape
 * cached after parsing. Deliberately close to the upstream XML fields
 * rather than the normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface FlathubCacheEntry {
  /** Flatpak application ID, e.g. "org.mozilla.firefox". */
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
  /** See `SourcedPackage.languages`. */
  languages?: string[];
  /** See `SourcedPackage.changelog`. */
  changelog?: string;
  /** See `SourcedPackage.lastUpdated`. */
  lastUpdated?: string;
  /** See `SourcedPackage.rating`. */
  rating?: { average: number; count: number };
  /** See `SourcedPackage.popularity`. */
  popularity?: number;
  /** See `SourcedPackage.storeCollections`. */
  storeCollections?: StoreCollectionTag[];
}

export interface FlathubFetchMetadata extends FetchMetadata {
  /** Repodata architecture fetched — Flathub publishes one appstream file per arch. */
  arch: string;
}
