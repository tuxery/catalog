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
   * Which component this package belongs to (main/contrib/non-free/
   * non-free-firmware — see fetch.ts) — kept as a per-row field rather
   * than only in fetch metadata, same reasoning as Ubuntu's `component`
   * and Arch's `repo`.
   */
  component: string;
  /** Debian's `Section` field, e.g. "libs", "games", "doc" — see SourcedPackage.section. */
  section?: string;
}

export interface DebianFetchMetadata extends FetchMetadata {
  /** Suite fetched, e.g. "stable" — Debian publishes one Packages file per suite/component/arch. */
  suite: string;
  component: string;
  arch: string;
}
