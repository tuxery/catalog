import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { DebianAppstreamCacheEntry } from "./types";

/**
 * Searches Debian's DEP-11 AppStream metadata for components matching
 * `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchDebianAppstream = makeCacheSearch<DebianAppstreamCacheEntry>(
  "deb-debian-appstream",
  normalize,
);
