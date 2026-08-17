import type { FetchMetadata } from "../_shared/metadata";

/**
 * One package stanza from Alpine's `APKINDEX` — single-letter-prefix
 * fields (`P:name`, `V:version`, `T:summary`, ...), the shape cached
 * after parsing. Deliberately close to the upstream fields rather than
 * the normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface AlpineCacheEntry {
  name: string;
  description: string;
  version: string;
  homepage?: string;
  /** Which repo this package belongs to — "main" (Alpine-team-maintained) or "community" (broader, community-maintained), same organizing split as Debian's main/contrib/non-free. */
  repo: "main" | "community";
}

export interface AlpineFetchMetadata extends FetchMetadata {
  reposFetched: string[];
}
