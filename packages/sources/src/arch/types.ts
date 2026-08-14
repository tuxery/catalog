import type { FetchMetadata } from "../_shared/metadata";

/**
 * One package's `desc` file from Arch's official repo databases
 * (`core.db`/`extra.db`), the shape cached after parsing. Deliberately
 * close to the upstream fields rather than the normalized
 * `SourcedPackage` — see `normalize.ts`.
 */
export interface ArchCacheEntry {
  name: string;
  description: string;
  version: string;
  homepage?: string;
}

export interface ArchFetchMetadata extends FetchMetadata {
  /** Repos fetched and merged — "core" and "extra", not AUR (a separate source) or multilib. */
  repos: string[];
  arch: string;
}
