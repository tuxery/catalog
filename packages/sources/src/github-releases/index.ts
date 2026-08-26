import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { GithubReleasesCacheEntry } from "./types";

/**
 * Searches the cached GitHub-Releases source for packages matching
 * `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchGithubReleases = makeCacheSearch<GithubReleasesCacheEntry>(
  "github-releases",
  normalize,
);
