import type { FetchMetadata } from "../_shared/metadata";

/**
 * One GitHub repository some package of another source points to (its
 * homepage or an AppStream project link, see `repo-url.ts`), with its
 * star count. Not a package source: it lists no packages, the curator
 * joins it to the apps whose packages point to the repository (see
 * `curator/enrich/github-stars.ts`).
 */
export interface GithubStarsCacheEntry {
  /** `owner/repo` as the packages spell it, lowercased: the join key. */
  repo: string;
  /** The repository's stargazer count. */
  stars: number;
  /**
   * `owner/repo` where GitHub actually serves it, lowercased, when it
   * differs from `repo`: a renamed or transferred repository, which GitHub
   * still answers for under its old name. Two keys with one `canonical`
   * are one repository.
   */
  canonical?: string;
}

export interface GithubStarsFetchMetadata extends FetchMetadata {
  /** Distinct repositories the other sources' caches point to. */
  repositoriesReferenced: number;
  /** Of those, how many GitHub was asked about in this run (fewer when the rate limit ran out). */
  repositoriesQueried: number;
  /** Of those asked about, how many GitHub doesn't serve (deleted, private, blocked). */
  repositoriesMissing: number;
  /** The first known repository this run didn't reach, where the next run starts; absent when it reached them all. */
  cursor?: string;
}
