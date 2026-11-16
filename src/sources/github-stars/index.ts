import { cachePathFor } from "../_shared/cache-path";
import { readNdjson } from "../_shared/ndjson";
import type { GithubStarsCacheEntry } from "./types";

export type { GithubStarsCacheEntry } from "./types";
export { githubRepoFromUrl, packageGithubRepos } from "./repo-url";

/**
 * Reads the git-committed GitHub stars cache (see AGENTS.md's "Source
 * cache"), keyed by its `repo` — empty when the cache isn't there.
 */
export function readGithubStars(
  cachePath: string = cachePathFor("github-stars"),
): Map<string, GithubStarsCacheEntry> {
  return new Map(readNdjson<GithubStarsCacheEntry>(cachePath).map((entry) => [entry.repo, entry]));
}
