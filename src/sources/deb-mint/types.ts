import type { FetchMetadata } from "../_shared/metadata";

/**
 * One package stanza from Linux Mint's `main` component (deb822 format,
 * same as Debian/Ubuntu — Mint is a Debian/Ubuntu derivative), the shape
 * cached after parsing. Deliberately close to the upstream fields rather
 * than the normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface MintCacheEntry {
  name: string;
  description: string;
  version: string;
  homepage?: string;
  /** Debian's own Section vocabulary (e.g. `admin`, `misc`) — Mint reuses it verbatim, so it's filtered the same way (`NOISE_SECTIONS`) rather than needing its own signal. */
  section?: string;
}

export interface MintFetchMetadata extends FetchMetadata {
  release: string;
  component: string;
  arch: string;
}
