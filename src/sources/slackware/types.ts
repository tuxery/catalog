import type { FetchMetadata } from "../_shared/metadata";

/**
 * One package block from Slackware's `PACKAGES.TXT`, the shape cached
 * after parsing. Deliberately close to the upstream fields rather than
 * the normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface SlackwareCacheEntry {
  name: string;
  version: string;
  summary: string;
  homepage?: string;
  /** Slackware's package "series" — the short component code from `PACKAGE LOCATION` (e.g. `l` for libraries, `kde`, `xfce`, `y` for games) — see `SourcedPackage.section`. */
  series: string;
}

export type SlackwareFetchMetadata = FetchMetadata;
