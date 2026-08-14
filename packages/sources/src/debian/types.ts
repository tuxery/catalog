import type { FetchMetadata } from "../_shared/metadata";

/**
 * One stanza from Debian's `Packages.gz` (deb822 format), the shape
 * cached after parsing. Deliberately close to the upstream fields rather
 * than the normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface DebianCacheEntry {
  name: string;
  description: string;
  version: string;
  homepage?: string;
}

export interface DebianFetchMetadata extends FetchMetadata {
  /** Suite fetched, e.g. "stable" — Debian publishes one Packages file per suite/component/arch. */
  suite: string;
  component: string;
  arch: string;
}
