import type { FetchMetadata } from "../_shared/metadata";

/**
 * One package stanza from Pop!_OS's `main` component (deb822 format,
 * same as Debian/Ubuntu — Pop!_OS is a derivative), already narrowed to
 * genuinely System76-authored packages (see `fetch.ts`'s
 * `isSystem76Package`) — the shape cached after parsing. Deliberately
 * close to the upstream fields rather than the normalized
 * `SourcedPackage` — see `normalize.ts`.
 */
export interface PopOsCacheEntry {
  name: string;
  description: string;
  version: string;
  homepage?: string;
  section?: string;
}

export interface PopOsFetchMetadata extends FetchMetadata {
  release: string;
  component: string;
  arch: string;
}
