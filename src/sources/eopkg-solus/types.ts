import type { FetchMetadata } from "../_shared/metadata";

/**
 * One `<Package>` entry from Solus's `eopkg-index.xml` repodata, the
 * shape cached after parsing. Deliberately close to the upstream fields
 * rather than the normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface SolusCacheEntry {
  name: string;
  summary: string;
  version: string;
  homepage?: string;
  /** Solus's own hierarchical grouping (e.g. `games.strategy`, `programming.library`) — see `SourcedPackage.section`. */
  partOf?: string;
}

export type SolusFetchMetadata = FetchMetadata;
