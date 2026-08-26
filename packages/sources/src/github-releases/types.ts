import type { FetchMetadata } from "../_shared/metadata";

/**
 * One GitHub repo discovered via the `topic:linux-app` search that also
 * has a real tagged Release — the closest thing this source has to a
 * "this is an installable app, not just a repo" signal. See fetch.ts for
 * the full scoping (why the topic alone isn't sufficient, and why a
 * Release is necessary-but-not-sufficient too).
 */
export interface GithubReleasesCacheEntry {
  /** The repo's own short name (GitHub's `name` field, e.g. "superfile") — not always the app's actual display name, but the only name every repo reliably has. */
  name: string;
  description: string;
  /** "owner/repo" — this source's stable identifier. */
  repo: string;
  /** Latest Release's tag name. */
  version: string;
  homepage: string;
  /** The Release page itself, not a specific asset — no reliable per-project convention for picking "the right download" across arbitrary repos, so this hands off to the user instead of guessing. */
  releaseUrl: string;
  stars: number;
}

export interface GithubReleasesFetchMetadata extends FetchMetadata {
  /** Repos matching `topic:linux-app archived:false`, before filtering to ones with a real Release. */
  totalSearchResults: number;
}
