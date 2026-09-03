import type { FetchMetadata } from "../_shared/metadata";

/**
 * One `Type: desktop-application`/`console-application` component from
 * Debian's DEP-11 AppStream YAML (`dep11/Components-<arch>.yml.gz`), the
 * shape cached after parsing. Deliberately close to the upstream fields
 * rather than the normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface DebianAppstreamCacheEntry {
  /** AppStream desktop-id, e.g. "org.gnome.gitg". */
  id: string;
  /** Which Debian component (main/contrib/non-free) this component came from. */
  component: string;
  /** Binary package name — the join key to deb-debian/deb-ubuntu. */
  pkgname: string;
  /** Untranslated (`C:`) display name. */
  name: string;
  /** Untranslated (`C:`) summary. */
  summary: string;
  /** `Icon: remote:` url resolved against the document's MediaBaseUrl. */
  iconUrl?: string;
  homepage?: string;
  /** Whether `Categories:` includes "Game" — see `SourcedPackage.hasGameCategory`. */
  hasGameCategory: boolean;
  /** Every raw `Categories:` value — see `SourcedPackage.categories`. */
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
}

export interface DebianAppstreamFetchMetadata extends FetchMetadata {
  /** Suite fetched, e.g. "stable" — one DEP-11 file per suite/component/arch. */
  suite: string;
  component: string;
  arch: string;
}
