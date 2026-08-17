import type { FetchMetadata } from "../_shared/metadata";

/**
 * One package stanza from MX Linux's `main` component (deb822 format,
 * same as Debian — MX Linux is a Debian derivative), already narrowed
 * to genuinely MX-authored packages (see `fetch.ts`'s `isMxPackage`) —
 * the shape cached after parsing. Deliberately close to the upstream
 * fields rather than the normalized `SourcedPackage` — see
 * `normalize.ts`.
 */
export interface MxLinuxCacheEntry {
  name: string;
  description: string;
  version: string;
  homepage?: string;
  section?: string;
}

export interface MxLinuxFetchMetadata extends FetchMetadata {
  release: string;
  component: string;
  arch: string;
}
