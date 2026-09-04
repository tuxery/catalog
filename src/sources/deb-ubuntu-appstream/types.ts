import type { FetchMetadata } from "../_shared/metadata";

/**
 * One app-type component from Ubuntu's DEP-11 AppStream YAML
 * (`dep11/Components-<arch>.yml.gz`), the shape cached after parsing. Same
 * shape as Debian's `DebianAppstreamCacheEntry` — both parse the identical
 * DEP-11 format via `_shared/dep11.ts` — kept as its own named type
 * rather than imported cross-source, matching this codebase's "no single
 * shared cache-row schema" convention.
 */
export interface UbuntuAppstreamCacheEntry {
  /** AppStream desktop-id, e.g. "org.gimp.gimp". */
  id: string;
  /** Which Ubuntu component (main/universe/multiverse) this component came from. */
  component: string;
  /** Binary package name — the join key to deb-ubuntu. */
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

export interface UbuntuAppstreamFetchMetadata extends FetchMetadata {
  /** Suite fetched — Ubuntu uses codenames, resolved live via Launchpad. */
  suite: string;
  /** Components merged, e.g. "main+universe+multiverse" (restricted ships no apps). */
  component: string;
  arch: string;
}
