import type { FetchMetadata } from "../_shared/metadata";

/**
 * One package stanza from Deepin's `main` component (deb822 format,
 * same as Debian/Ubuntu — Deepin is a derivative), already narrowed to
 * genuinely Deepin-authored packages and deduplicated to the newest
 * version per name (see `fetch.ts`) — the shape cached after parsing.
 * Deliberately close to the upstream fields rather than the normalized
 * `SourcedPackage` — see `normalize.ts`.
 */
export interface DeepinCacheEntry {
  name: string;
  description: string;
  version: string;
  homepage?: string;
  section?: string;
}

export interface DeepinFetchMetadata extends FetchMetadata {
  release: string;
  component: string;
  arch: string;
}
