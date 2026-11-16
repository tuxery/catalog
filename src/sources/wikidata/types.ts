import type { FetchMetadata } from "../_shared/metadata";

/**
 * The Wikidata properties that name a software item's package on one
 * repository, read by `fetch.ts`. Each value is the identifier as that
 * repository spells it (a Flathub app id, an AUR package name, a Gentoo
 * `category/name`), checked against Wikidata's own formatter URL on
 * 2026-11-16. Which of our sources each one maps to, and how, is the
 * bridge's business (`src/pipeline/wikidata-bridge.ts`), not this file's.
 *
 * Repology's project name (P6931) is deliberately absent: it names a
 * Repology project, not a package on any repository we read, so turning
 * it into package ids needs Repology's own data, which we don't use.
 */
export const WIKIDATA_PACKAGE_PROPERTIES = {
  P4655: "Flathub ID",
  P4435: "snap package",
  P4162: "AUR package",
  P3454: "Arch Linux package",
  P3442: "Debian stable package",
  P3473: "Ubuntu package",
  P3463: "Fedora package",
  P7788: "openSUSE package",
  P3499: "Gentoo package",
  P9045: "Alpine Linux package",
  P12433: "nixpkgs ID",
  P8443: "Homebrew formula name",
} as const;

export type WikidataPackageProperty = keyof typeof WIKIDATA_PACKAGE_PROPERTIES;

/**
 * One Wikidata item carrying at least one `WIKIDATA_PACKAGE_PROPERTIES`
 * statement: the software it describes, as Wikidata's editors linked it.
 * Truthy statements only (best rank, so a deprecated package name is
 * gone); every list is sorted and deduplicated, and absent when empty.
 */
export interface WikidataCacheEntry {
  /** The item's id, `Q698`. */
  qid: string;
  /** Its English label, when it has one. */
  label?: string;
  /** Package ids by property, `{ P4655: ["org.mozilla.firefox"], P3454: ["firefox"] }`. */
  packages: Partial<Record<WikidataPackageProperty, string[]>>;
  /** Official website (P856). */
  websites?: string[];
  /** Source code repository (P1324). */
  repositories?: string[];
  /** Logo (P154), as a Wikimedia Commons file name (`Firefox logo, 2019.svg`). */
  logos?: string[];
}

export interface WikidataFetchMetadata extends FetchMetadata {
  /** The SPARQL queries run, by what they read, so a refresh can be reproduced by hand. */
  queries: Record<string, string>;
  /** Statements read per package property. */
  statements: Partial<Record<WikidataPackageProperty, number>>;
}
