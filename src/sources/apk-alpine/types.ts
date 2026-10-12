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
  /** APKINDEX `L:`, an SPDX expression — see `SourcedPackage.license`. */
  license?: string;
  /** APKINDEX `t:` (build time, epoch seconds) as an ISO date — see `SourcedPackage.builtAt`. */
  builtAt?: string;
  /** APKINDEX `I:`, in bytes — see `SourcedPackage.installedSizeBytes`. */
  installedSizeBytes?: number;
  /** Which repo this package belongs to — "main" (Alpine-team-maintained) or "community" (broader, community-maintained), same organizing split as Debian's main/contrib/non-free. */
  repo: "main" | "community";
}

export interface AlpineFetchMetadata extends FetchMetadata {
  reposFetched: string[];
}
