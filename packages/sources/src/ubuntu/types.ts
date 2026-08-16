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
  /**
   * Which component this package belongs to — varies per package (unlike
   * `arch`/`suite`, the same for every row in one fetch), so it lives
   * here rather than only in the fetch metadata. `main` is enabled out of
   * the box on a default Ubuntu install; `universe`/`restricted`/
   * `multiverse` all need their repository enabled first — a real
   * install-instructions difference, not just organizational.
   */
  component: "main" | "universe" | "restricted" | "multiverse";
  /**
   * Ubuntu's `Section` field, e.g. "libs", "games", "doc" — raw upstream
   * value, still carrying the `<component>/` prefix non-main components
   * get (e.g. "universe/games"); `normalize.ts` strips that so it's
   * directly comparable to Debian's bare value. See SourcedPackage.section.
   */
  section?: string;
}

export interface UbuntuFetchMetadata extends FetchMetadata {
  /** Suite fetched, e.g. "resolute" — Ubuntu uses codenames, not "stable" like Debian. */
  suite: string;
  /** Components merged, e.g. "main+universe+restricted+multiverse" — see fetch.ts for why all four are needed here. */
  component: string;
  arch: string;
}
