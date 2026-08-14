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
  /**
   * Which component this package belongs to — always "main" today (see
   * fetch.ts), but kept as a per-row field rather than only in fetch
   * metadata so it starts varying correctly the day contrib/non-free are
   * added too, same reasoning as Ubuntu's `component` and Arch's `repo`.
   */
  component: string;
}

export interface DebianFetchMetadata extends FetchMetadata {
  /** Suite fetched, e.g. "stable" — Debian publishes one Packages file per suite/component/arch. */
  suite: string;
  component: string;
  arch: string;
}
