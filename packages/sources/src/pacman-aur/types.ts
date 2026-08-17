import type { FetchMetadata } from "../_shared/metadata";

/**
 * One entry from the AUR's `packages-meta-ext-v1.json.gz` metadata dump,
 * the shape cached after fetching. Deliberately close to the upstream
 * fields rather than the normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface AurCacheEntry {
  name: string;
  description: string;
  version: string;
  homepage?: string;
}

export type AurFetchMetadata = FetchMetadata;
