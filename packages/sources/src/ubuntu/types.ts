import type { FetchMetadata } from "../_shared/metadata";

/**
 * One stanza from Ubuntu's `Packages.gz` — same deb822 format as Debian's
 * (Ubuntu's archive is a Debian derivative), the shape cached after
 * parsing. Deliberately close to the upstream fields rather than the
 * normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface UbuntuCacheEntry {
  name: string;
  description: string;
  version: string;
  homepage?: string;
}

export interface UbuntuFetchMetadata extends FetchMetadata {
  /** Suite fetched, e.g. "resolute" — Ubuntu uses codenames, not "stable" like Debian. */
  suite: string;
  /** Components merged, e.g. "main+universe" — see fetch.ts for why both are needed here. */
  component: string;
  arch: string;
}
